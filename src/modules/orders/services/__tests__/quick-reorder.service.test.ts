import { describe, expect, it, vi } from "vitest";

import { NotFoundError } from "../../../access-control/services";
import type { PartnerOrderHistoryRepository } from "../../repositories";
import { compareQuickReorderPrices, QuickReorderService } from "../quick-reorder.service";

const ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("QuickReorderService preview", () => {
  it("bulk-loads current commercial data once and defaults valid lines to historical quantities", async () => {
    const dependencies = makeDependencies();
    const result = await dependencies.service.preview("user-1", ORDER_ID);

    expect(dependencies.repository.getReorderSource).toHaveBeenCalledWith(ORDER_ID);
    expect(dependencies.pricing.getProductCommercialViews).toHaveBeenCalledOnce();
    expect(dependencies.pricing.getProductCommercialViews).toHaveBeenCalledWith("user-1", ["product-1", "product-2"]);
    expect(result.lines[0]).toMatchObject({ historicalQuantity: 3, selectedByDefault: true, status: "price_changed" });
    expect(result.lines[1]).toMatchObject({ selectedByDefault: true, status: "temporarily_unavailable" });
  });

  it("reports missing price, inactive product, and invalid 1C identity without selecting them", async () => {
    const dependencies = makeDependencies();
    dependencies.pricing.getProductCommercialViews.mockResolvedValue([
      commercial("product-1", null, 5),
      commercial("product-2", 20, 0),
    ]);
    dependencies.repository.getReorderSource.mockResolvedValue({
      ...source(),
      lines: [
        source().lines[0],
        { ...source().lines[1], currentIsActive: false },
        { ...source().lines[0], lineId: "line-3", productId: "product-3", currentExternalProductRef: "invalid" },
      ],
    });

    const result = await dependencies.service.preview("user-1", ORDER_ID);

    expect(result.lines.map((line) => line.status)).toEqual(["missing_price", "unavailable", "review_required"]);
    expect(result.lines.every((line) => !line.canSelect)).toBe(true);
  });

  it("marks stale current prices for review and excludes them from conversion", async () => {
    const dependencies = makeDependencies();
    const value = source();
    value.lines[0].lineId = "11111111-1111-4111-8111-111111111111";
    dependencies.repository.getReorderSource.mockResolvedValue(value);
    dependencies.pricing.getProductCommercialViews.mockResolvedValue([{ ...commercial("product-1", 10, 5), partnerPrice: { amount: 10, currencyCode: "USD", formattedAmount: "$10.00", lastUpdatedAt: "2026-01-01T00:00:00Z" } }]);

    const preview = await dependencies.service.preview("user-1", ORDER_ID);
    const conversion = await dependencies.service.addSelectedToCart("user-1", {
      orderId: ORDER_ID,
      requestKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      lines: [{ lineId: value.lines[0].lineId, quantity: 1 }],
    });

    expect(preview.lines[0]).toMatchObject({ status: "review_required", canSelect: false });
    expect(conversion).toMatchObject({ cartId: null, skipped: 1 });
    expect(dependencies.cart.mergeOrderReorderItems).not.toHaveBeenCalled();
  });

  it("denies a source order outside the active company", async () => {
    const dependencies = makeDependencies();
    dependencies.repository.getReorderSource.mockResolvedValue({ ...source(), companyId: "other-company" });

    await expect(dependencies.service.preview("user-1", ORDER_ID)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("quick reorder commercial difference", () => {
  it.each([
    [10, 12, "increased", 2, 20],
    [10, 8, "decreased", -2, -20],
    [10, 10, "unchanged", 0, 0],
  ] as const)("classifies %s to %s as %s", (historical, current, kind, absolute, percent) => {
    expect(compareQuickReorderPrices(historical, "USD", current, "USD")).toMatchObject({
      kind,
      absoluteDifference: absolute,
      percentageDifference: percent,
    });
  });

  it("does not compare different currencies or mutate either source value", () => {
    const historical = 10;
    const current = 180;
    expect(compareQuickReorderPrices(historical, "USD", current, "MDL")).toMatchObject({
      kind: "unavailable",
      label: "Сравнение цены недоступно",
    });
    expect(historical).toBe(10);
    expect(current).toBe(180);
  });
});

describe("QuickReorderService cart conversion", () => {
  it("adds only selected valid lines through one bulk cart mutation", async () => {
    const dependencies = makeDependencies();
    const selectedLine = source();
    selectedLine.lines[0].lineId = "11111111-1111-4111-8111-111111111111";
    selectedLine.lines[1].lineId = "22222222-2222-4222-8222-222222222222";
    dependencies.repository.getReorderSource.mockResolvedValue(selectedLine);

    const result = await dependencies.service.addSelectedToCart("user-1", {
      orderId: ORDER_ID,
      requestKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      lines: [{ lineId: selectedLine.lines[0].lineId, quantity: 7 }],
    });

    expect(dependencies.pricing.getProductCommercialViews).toHaveBeenCalledWith("user-1", ["product-1"]);
    expect(dependencies.cart.mergeOrderReorderItems).toHaveBeenCalledOnce();
    expect(dependencies.cart.mergeOrderReorderItems).toHaveBeenCalledWith(expect.objectContaining({
      orderId: ORDER_ID,
      items: [{ lineId: selectedLine.lines[0].lineId, quantity: 7 }],
      requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(result).toMatchObject({ added: 1, updated: 0, cartId: "cart-1" });
  });

  it("rejects selected lines that do not belong to the source order", async () => {
    const dependencies = makeDependencies();
    await expect(dependencies.service.addSelectedToCart("user-1", {
      orderId: ORDER_ID,
      requestKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      lines: [{ lineId: "33333333-3333-4333-8333-333333333333", quantity: 1 }],
    })).rejects.toBeInstanceOf(NotFoundError);
    expect(dependencies.cart.mergeOrderReorderItems).not.toHaveBeenCalled();
  });

  it("reports inactive and missing-price products without sending them to the mutation", async () => {
    const dependencies = makeDependencies();
    const value = source();
    value.lines[0].lineId = "11111111-1111-4111-8111-111111111111";
    value.lines[1].lineId = "22222222-2222-4222-8222-222222222222";
    value.lines[0].currentIsActive = false;
    dependencies.repository.getReorderSource.mockResolvedValue(value);
    dependencies.pricing.getProductCommercialViews.mockResolvedValue([commercial("product-2", null, 0)]);

    const result = await dependencies.service.addSelectedToCart("user-1", {
      orderId: ORDER_ID,
      requestKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      lines: value.lines.map((line) => ({ lineId: line.lineId, quantity: 1 })),
    });

    expect(result).toMatchObject({ cartId: null, inactive: 1, missingPrice: 1 });
    expect(dependencies.cart.mergeOrderReorderItems).not.toHaveBeenCalled();
  });

  it("uses the request key for retry safety while allowing an explicit second attempt", async () => {
    const dependencies = makeDependencies();
    const value = source();
    value.lines[0].lineId = "11111111-1111-4111-8111-111111111111";
    dependencies.repository.getReorderSource.mockResolvedValue(value);
    const selection = [{ lineId: value.lines[0].lineId, quantity: 1 }];

    await dependencies.service.addSelectedToCart("user-1", { orderId: ORDER_ID, requestKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", lines: selection });
    dependencies.cart.mergeOrderReorderItems.mockResolvedValueOnce({ cartId: "cart-1", repeated: false, addedProductIds: [], updatedProductIds: ["product-1"] });
    await dependencies.service.addSelectedToCart("user-1", { orderId: ORDER_ID, requestKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", lines: selection });

    expect(dependencies.cart.mergeOrderReorderItems).toHaveBeenCalledTimes(2);
    expect(dependencies.cart.mergeOrderReorderItems.mock.calls.map((call) => call[0].requestKey)).toEqual([
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    ]);
  });
});

function makeDependencies() {
  const repository = {
    getReorderSource: vi.fn().mockResolvedValue(source()),
  } as unknown as PartnerOrderHistoryRepository & { getReorderSource: ReturnType<typeof vi.fn> };
  const companyAccess = {
    getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: "company-1", status: "active" }]),
    getActiveCompanyContext: vi.fn().mockResolvedValue({ company: { id: "company-1" } }),
  };
  const permission = { ensurePermission: vi.fn().mockResolvedValue(undefined) };
  const pricing = {
    getProductCommercialViews: vi.fn().mockResolvedValue([
      commercial("product-1", 10, 5),
      commercial("product-2", 20, 0),
    ]),
  };
  const cart = {
    mergeOrderReorderItems: vi.fn().mockResolvedValue({ cartId: "cart-1", repeated: false, addedProductIds: ["product-1"], updatedProductIds: [] }),
  };
  const service = new QuickReorderService(repository, companyAccess as never, permission as never, pricing as never, cart as never);
  return { service, repository, permission, pricing, cart };
}

function source() {
  return {
    orderId: ORDER_ID,
    companyId: "company-1",
    orderNumber: "NSUU-001",
    orderCurrencyCode: "USD",
    lines: [line("line-1", "product-1", 3), line("line-2", "product-2", 2)],
  };
}

function line(lineId: string, productId: string, quantity: number) {
  return {
    lineId, lineNumber: 1, productId,
    historicalExternalProductRef: "11111111-1111-1111-1111-111111111111",
    historicalProductName: "Camera", historicalSku: "SKU-1", historicalQuantity: quantity,
    historicalUnitPrice: 8, historicalCurrencyCode: "USD", productExists: true,
    currentExternalProductRef: "11111111-1111-1111-1111-111111111111",
    currentName: "Camera", currentSku: "SKU-1", currentSlug: "camera", currentImageUrl: null,
    currentCategoryId: "category-1", currentIsActive: true, currentIsVisible: true,
  };
}

function commercial(productId: string, amount: number | null, stock: number) {
  return {
    productId,
    partnerPrice: amount === null ? null : { amount, currencyCode: "USD", formattedAmount: `$${amount.toFixed(2)}`, lastUpdatedAt: new Date().toISOString() },
    retailPrice: null,
    stock: { exactAvailableQuantity: stock, expectedArrival: null },
    isDemoData: false,
  };
}

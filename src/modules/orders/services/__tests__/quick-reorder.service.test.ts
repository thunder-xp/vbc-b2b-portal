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
  const service = new QuickReorderService(repository, companyAccess as never, permission as never, pricing as never);
  return { service, repository, permission, pricing };
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
    partnerPrice: amount === null ? null : { amount, currencyCode: "USD", formattedAmount: `$${amount.toFixed(2)}` },
    retailPrice: null,
    stock: { exactAvailableQuantity: stock, expectedArrival: null },
    isDemoData: false,
  };
}

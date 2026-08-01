import { describe, expect, it, vi } from "vitest";

import type { PricingProvider } from "../../../integration/contracts";
import type { OrderPriceRefreshRepository } from "../../repositories";
import {
  DefaultOrderPriceRefreshService,
  OrderPriceDataMissingError,
  OrderPriceRefreshFailedError,
} from "../order-price-refresh.service";

const PRICE_TYPE = "11111111-1111-4111-8111-111111111111";
const PRODUCT_A = "22222222-2222-4222-8222-222222222222";
const PRODUCT_B = "33333333-3333-4333-8333-333333333333";

describe("DefaultOrderPriceRefreshService", () => {
  it("refreshes multiple products with one provider request and one atomic publication", async () => {
    const dependencies = setup();
    const result = await dependencies.service.refresh({
      externalPriceTypeRef: PRICE_TYPE,
      externalProductRefs: [PRODUCT_A, PRODUCT_B, PRODUCT_A],
    });

    expect(dependencies.provider.fetchCurrentProductPrices).toHaveBeenCalledOnce();
    expect(dependencies.repository.publishVerifiedPrices).toHaveBeenCalledOnce();
    expect(dependencies.repository.publishVerifiedPrices).toHaveBeenCalledWith(expect.objectContaining({
      externalPriceTypeRef: PRICE_TYPE,
      rows: [
        expect.objectContaining({ externalProductRef: PRODUCT_A, amount: 10 }),
        expect.objectContaining({ externalProductRef: PRODUCT_B, amount: 20 }),
      ],
    }));
    expect(result).toMatchObject({ productCount: 2, providerRequestCount: 1, deduplicated: false });
  });

  it("does not call 1C when a concurrent refresh already verified the same set", async () => {
    const dependencies = setup();
    dependencies.repository.claimLease.mockResolvedValue(false);
    dependencies.repository.hasVerifiedPricesSince.mockResolvedValue(true);

    const result = await dependencies.service.refresh({
      externalPriceTypeRef: PRICE_TYPE,
      externalProductRefs: [PRODUCT_A],
    });

    expect(result).toMatchObject({ providerRequestCount: 0, deduplicated: true });
    expect(dependencies.provider.fetchCurrentProductPrices).not.toHaveBeenCalled();
    expect(dependencies.repository.publishVerifiedPrices).not.toHaveBeenCalled();
  });

  it("rejects a missing current 1C price without publishing a partial set", async () => {
    const dependencies = setup();
    dependencies.provider.fetchCurrentProductPrices.mockResolvedValue([currentPrice(PRODUCT_A, 10)]);

    await expect(dependencies.service.refresh({
      externalPriceTypeRef: PRICE_TYPE,
      externalProductRefs: [PRODUCT_A, PRODUCT_B],
    })).rejects.toBeInstanceOf(OrderPriceDataMissingError);
    expect(dependencies.repository.publishVerifiedPrices).not.toHaveBeenCalled();
  });

  it("classifies provider timeout or transport failure as refresh failure", async () => {
    const dependencies = setup();
    dependencies.provider.fetchCurrentProductPrices.mockRejectedValue(new Error("timeout"));

    await expect(dependencies.service.refresh({
      externalPriceTypeRef: PRICE_TYPE,
      externalProductRefs: [PRODUCT_A],
    })).rejects.toBeInstanceOf(OrderPriceRefreshFailedError);
    expect(dependencies.repository.publishVerifiedPrices).not.toHaveBeenCalled();
  });
});

function setup() {
  const provider = {
    fetchProductPrices: vi.fn(),
    fetchCurrentProductPrices: vi.fn().mockResolvedValue([
      currentPrice(PRODUCT_A, 10),
      currentPrice(PRODUCT_B, 20),
    ]),
  } satisfies PricingProvider;
  const repository = {
    claimLease: vi.fn().mockResolvedValue(true),
    releaseLease: vi.fn().mockResolvedValue(undefined),
    hasVerifiedPricesSince: vi.fn().mockResolvedValue(false),
    publishVerifiedPrices: vi.fn().mockImplementation(async (input) => input.rows.length),
  } satisfies OrderPriceRefreshRepository;
  return {
    provider,
    repository,
    service: new DefaultOrderPriceRefreshService(provider, repository),
  };
}

function currentPrice(productReference: string, amount: number) {
  return {
    productReference: reference(productReference, "catalog-product"),
    priceTypeReference: reference(PRICE_TYPE, "price-type"),
    amount,
    effectiveAt: "2026-08-01T00:00:00.000Z",
    isActive: true,
  };
}

function reference(externalId: string, externalType: string) {
  return { providerCode: "one-c", externalId, externalType };
}

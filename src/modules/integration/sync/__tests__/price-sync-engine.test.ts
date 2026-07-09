import { describe, expect, it } from "vitest";

import type { PricingUpdaterService } from "../../../pricing-inventory/services";
import type { ERPProvider } from "../../contracts";
import type { ProductPriceDTO } from "../../dto";
import type { ReadModelUpdateResult } from "../sync-engine";
import { DefaultPriceSyncEngine } from "../price-sync-engine";

describe("DefaultPriceSyncEngine", () => {
  it("imports all paginated price pages", async () => {
    const updater = new FakePricingUpdater();
    const engine = new DefaultPriceSyncEngine(
      makeProvider({ paginated: true }),
      updater,
    );

    const report = await engine.syncPrices();

    expect(report.status).toBe("succeeded");
    expect(report.pricesReceived).toBe(2);
    expect(report.pricesCreated).toBe(2);
  });

  it("returns skipped warnings without failing the whole sync", async () => {
    const updater = new FakePricingUpdater({ skipped: 1 });
    const engine = new DefaultPriceSyncEngine(makeProvider(), updater);

    const report = await engine.syncPrices();

    expect(report.status).toBe("succeeded");
    expect(report.pricesSkipped).toBe(1);
    expect(report.warnings).toContain("Price skipped");
  });

  it("keeps imported counts partial when provider fails after no writes", async () => {
    const engine = new DefaultPriceSyncEngine(
      makeProvider({ fail: true }),
      new FakePricingUpdater(),
    );

    const report = await engine.syncPrices();

    expect(report.status).toBe("failed");
    expect(report.failed).toBe(1);
    expect(report.errors).toContain("Price synchronization failed.");
  });
});

class FakePricingUpdater implements PricingUpdaterService {
  constructor(private readonly options: { skipped?: number } = {}) {}

  async updatePricingReadModel(input: {
    prices: ProductPriceDTO[];
  }): Promise<ReadModelUpdateResult> {
    return {
      created: input.prices.length - (this.options.skipped ?? 0),
      updated: 0,
      skipped: this.options.skipped ?? 0,
      failed: 0,
      warnings: this.options.skipped ? ["Price skipped"] : [],
    };
  }
}

function makeProvider(
  options: { fail?: boolean; paginated?: boolean } = {},
): ERPProvider {
  return {
    providerCode: "test-provider",
    capabilities: {
      catalog: false,
      pricing: true,
      inventory: false,
      orders: false,
      documents: false,
      finance: false,
      partners: false,
    },
    catalog: null,
    pricing: {
      fetchProductPrices: async (input) => {
        if (options.fail) {
          throw new Error("Provider failed");
        }

        if (options.paginated && !input.page?.cursor) {
          return {
            items: [makePriceDto("PRICE-1")],
            nextCursor: "page-2",
          };
        }

        if (options.paginated && input.page?.cursor === "page-2") {
          return {
            items: [makePriceDto("PRICE-2")],
            nextCursor: null,
          };
        }

        return {
          items: [makePriceDto("PRICE-1")],
          nextCursor: null,
        };
      },
    },
    inventory: null,
    orders: null,
    documents: null,
    finance: null,
    partners: null,
    checkHealth: async () => ({
      providerCode: "test-provider",
      isAvailable: true,
      checkedAt: now,
      message: null,
    }),
  };
}

const now = "2026-07-09T00:00:00.000Z";

function makePriceDto(externalId: string): ProductPriceDTO {
  return {
    reference: {
      providerCode: "test-provider",
      externalId,
      externalType: "product-price",
    },
    productReference: {
      providerCode: "test-provider",
      externalId: "PRODUCT-1",
      externalType: "catalog-product",
    },
    partnerCompanyReference: null,
    priceTypeReference: {
      providerCode: "test-provider",
      externalId: "BASE",
      externalType: "price-type",
    },
    money: {
      currency: "BGN",
      amount: 100,
    },
    validFrom: now,
    validTo: null,
    isActive: true,
    metadata: {
      sourceReference: {
        providerCode: "test-provider",
        externalId,
        externalType: "product-price",
      },
      sourceUpdatedAt: now,
      importedAt: null,
    },
  };
}

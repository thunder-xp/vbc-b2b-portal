import { describe, expect, it } from "vitest";

import type { InventoryUpdaterService } from "../../../pricing-inventory/services";
import type { ERPProvider } from "../../contracts";
import type { StockBalanceDTO } from "../../dto";
import type { ReadModelUpdateResult } from "../sync-engine";
import { DefaultStockSyncEngine } from "../stock-sync-engine";

describe("DefaultStockSyncEngine", () => {
  it("imports all paginated stock pages", async () => {
    const updater = new FakeInventoryUpdater();
    const engine = new DefaultStockSyncEngine(
      makeProvider({ paginated: true }),
      updater,
    );

    const report = await engine.syncStock();

    expect(report.status).toBe("succeeded");
    expect(report.stockReceived).toBe(2);
    expect(report.stockCreated).toBe(2);
  });

  it("returns skipped warnings without failing the whole sync", async () => {
    const updater = new FakeInventoryUpdater({ skipped: 1 });
    const engine = new DefaultStockSyncEngine(makeProvider(), updater);

    const report = await engine.syncStock();

    expect(report.status).toBe("succeeded");
    expect(report.stockSkipped).toBe(1);
    expect(report.warnings).toContain("Stock skipped");
  });

  it("fails safely when provider fails", async () => {
    const engine = new DefaultStockSyncEngine(
      makeProvider({ fail: true }),
      new FakeInventoryUpdater(),
    );

    const report = await engine.syncStock();

    expect(report.status).toBe("failed");
    expect(report.failed).toBe(1);
    expect(report.errors).toContain("Stock synchronization failed.");
  });
});

class FakeInventoryUpdater implements InventoryUpdaterService {
  constructor(private readonly options: { skipped?: number } = {}) {}

  async updateInventoryReadModel(input: {
    stockBalances: StockBalanceDTO[];
  }): Promise<ReadModelUpdateResult> {
    return {
      created: input.stockBalances.length - (this.options.skipped ?? 0),
      updated: 0,
      skipped: this.options.skipped ?? 0,
      failed: 0,
      warnings: this.options.skipped ? ["Stock skipped"] : [],
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
      pricing: false,
      inventory: true,
      orders: false,
      documents: false,
      finance: false,
      partners: false,
    },
    catalog: null,
    pricing: null,
    inventory: {
      fetchStockBalances: async (input) => {
        if (options.fail) {
          throw new Error("Provider failed");
        }

        if (options.paginated && !input.page?.cursor) {
          return {
            items: [makeStockDto("STOCK-1")],
            nextCursor: "page-2",
          };
        }

        if (options.paginated && input.page?.cursor === "page-2") {
          return {
            items: [makeStockDto("STOCK-2")],
            nextCursor: null,
          };
        }

        return {
          items: [makeStockDto("STOCK-1")],
          nextCursor: null,
        };
      },
    },
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

function makeStockDto(externalId: string): StockBalanceDTO {
  return {
    reference: {
      providerCode: "test-provider",
      externalId,
      externalType: "stock-balance",
    },
    productReference: {
      providerCode: "test-provider",
      externalId: "PRODUCT-1",
      externalType: "catalog-product",
    },
    warehouseReference: null,
    warehouseName: "Main warehouse",
    availableQuantity: 10,
    reservedQuantity: 0,
    expectedQuantity: null,
    expectedAt: null,
    sourceUpdatedAt: now,
    isActive: true,
    metadata: {
      sourceReference: {
        providerCode: "test-provider",
        externalId,
        externalType: "stock-balance",
      },
      sourceUpdatedAt: now,
      importedAt: null,
    },
  };
}

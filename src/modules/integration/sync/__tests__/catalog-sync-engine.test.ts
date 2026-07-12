import { describe, expect, it, vi } from "vitest";

import { DefaultCatalogSyncEngine } from "../catalog-sync-engine";
import type { CatalogUpdaterService } from "../../../catalog/services";
import type { ERPProvider } from "../../contracts";
import type { CatalogCategoryDTO } from "../../dto";
import type { ReadModelUpdateResult } from "../sync-engine";
import type { CatalogSnapshotWriter } from "../catalog-snapshot-writer";

describe("DefaultCatalogSyncEngine", () => {
  it("skips a concurrent full snapshot sync", async () => {
    const provider = createSnapshotProvider();
    const writer = createSnapshotWriter({ acquireLock: async () => false });
    const report = await new DefaultCatalogSyncEngine(provider, new FakeCatalogUpdater(), writer).syncCatalog();
    expect(report.skippedBecauseRunning).toBe(true);
    expect(writer.writeSnapshot).not.toHaveBeenCalled();
  });

  it("writes folders before completion and finalizes successful deactivation counts", async () => {
    const provider = createSnapshotProvider();
    const writer = createSnapshotWriter();
    const report = await new DefaultCatalogSyncEngine(provider, new FakeCatalogUpdater(), writer).syncCatalog();
    expect(writer.writeSnapshot).toHaveBeenCalledOnce();
    expect(writer.markSucceeded).toHaveBeenCalledOnce();
    expect(writer.markFailed).not.toHaveBeenCalled();
    expect(report.rowsDeactivated).toBe(2);
  });

  it("marks a failed full sync without invoking snapshot persistence when provider fails", async () => {
    const provider = createSnapshotProvider(new Error("offline"));
    const writer = createSnapshotWriter();
    const report = await new DefaultCatalogSyncEngine(provider, new FakeCatalogUpdater(), writer).syncCatalog();
    expect(report.status).toBe("failed");
    expect(writer.writeSnapshot).not.toHaveBeenCalled();
    expect(writer.markFailed).toHaveBeenCalledOnce();
  });
  it("imports catalog categories, brands, and products in order", async () => {
    const provider = makeProvider();
    const updater = new FakeCatalogUpdater();
    const engine = new DefaultCatalogSyncEngine(provider, updater);

    const report = await engine.syncCatalog();

    expect(report.status).toBe("succeeded");
    expect(report.categoriesReceived).toBe(1);
    expect(report.brandsReceived).toBe(1);
    expect(report.productsReceived).toBe(1);
    expect(report.categoriesCreated).toBe(1);
    expect(report.brandsCreated).toBe(1);
    expect(report.productsCreated).toBe(1);
    expect(updater.calls).toEqual(["categories", "brands", "products"]);
  });

  it("imports all provider pages when nextCursor is returned", async () => {
    const provider = makeProvider({ paginatedProducts: true });
    const updater = new FakeCatalogUpdater();
    const engine = new DefaultCatalogSyncEngine(provider, updater);

    const report = await engine.syncCatalog();

    expect(report.status).toBe("succeeded");
    expect(report.productsReceived).toBe(2);
    expect(report.productsCreated).toBe(2);
  });

  it("returns partial result when products fail after categories and brands", async () => {
    const provider = makeProvider({ failProducts: true });
    const updater = new FakeCatalogUpdater();
    const engine = new DefaultCatalogSyncEngine(provider, updater);

    const report = await engine.syncCatalog();

    expect(report.status).toBe("partial");
    expect(report.categoriesCreated).toBe(1);
    expect(report.brandsCreated).toBe(1);
    expect(report.productsReceived).toBe(0);
    expect(report.failed).toBe(1);
    expect(report.errors).toContain("Catalog synchronization failed.");
  });
});

function createSnapshotProvider(failure?: Error): ERPProvider {
  const provider = makeProvider();
  return { ...provider, catalog: { ...provider.catalog!, fetchFullSnapshot: async () => {
      if (failure) throw failure;
      return { rootReference: { providerCode: "one-c", externalId: "root", externalType: "catalog-category" }, rootName: "SECURITYPARK DISTRIBUTION", categories: [makeCategory()], products: [makeProductDto("P-1")], pagesProcessed: 1, rowsReceived: 3 };
    } } };
}

function createSnapshotWriter(overrides: Partial<CatalogSnapshotWriter> = {}) {
  return {
    acquireLock: vi.fn(async () => true),
    writeSnapshot: vi.fn(async () => ({ foldersUpserted: 1, productsUpserted: 1, rowsDeactivated: 2 })),
    markSucceeded: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
    getState: vi.fn(async () => ({ status: "never_run", rootName: null, lastSuccessfulSyncAt: null, durationMs: null, pagesProcessed: 0, foldersReceived: 0, productsReceived: 0, foldersUpserted: 0, productsUpserted: 0, rowsDeactivated: 0, errorCategory: null, nextScheduledRun: new Date().toISOString() })),
    ...overrides,
  } satisfies CatalogSnapshotWriter;
}

class FakeCatalogUpdater implements CatalogUpdaterService {
  readonly calls: string[] = [];

  async updateCatalogReadModel(input: {
    categories: CatalogCategoryDTO[];
    brands: unknown[];
    products: unknown[];
  }): Promise<ReadModelUpdateResult> {
    if (input.categories.length > 0) {
      this.calls.push("categories");
    }

    if (input.brands.length > 0) {
      this.calls.push("brands");
    }

    if (input.products.length > 0) {
      this.calls.push("products");
    }

    return {
      created:
        input.categories.length + input.brands.length + input.products.length,
      updated: 0,
      skipped: 0,
      failed: 0,
      warnings: [],
    };
  }
}

function makeProvider(
  options: { failProducts?: boolean; paginatedProducts?: boolean } = {},
): ERPProvider {
  return {
    providerCode: "test-provider",
    capabilities: {
      catalog: true,
      pricing: false,
      inventory: false,
      orders: false,
      documents: false,
      finance: false,
      partners: false,
    },
    catalog: {
      fetchCategories: async () => ({
        items: [makeCategory()],
        nextCursor: null,
      }),
      fetchBrands: async () => ({
        items: [
          {
            reference: {
              providerCode: "test-provider",
              externalId: "B-1",
              externalType: "brand",
            },
            name: "Brand",
            slug: "brand",
            description: null,
            logoUrl: null,
            isActive: true,
            metadata: {
              sourceReference: {
                providerCode: "test-provider",
                externalId: "B-1",
                externalType: "brand",
              },
              sourceUpdatedAt: null,
              importedAt: null,
            },
          },
        ],
        nextCursor: null,
      }),
      fetchProducts: async (input) => {
        if (options.failProducts) {
          throw new Error("Provider failed");
        }

        if (options.paginatedProducts && !input.page?.cursor) {
          return {
            items: [makeProductDto("P-1")],
            nextCursor: "page-2",
          };
        }

        if (options.paginatedProducts && input.page?.cursor === "page-2") {
          return {
            items: [makeProductDto("P-2")],
            nextCursor: null,
          };
        }

        return {
          items: [makeProductDto("P-1")],
          nextCursor: null,
        };
      },
    },
    pricing: null,
    inventory: null,
    orders: null,
    documents: null,
    finance: null,
    partners: null,
    checkHealth: async () => ({
      providerCode: "test-provider",
      isAvailable: true,
      checkedAt: new Date().toISOString(),
      message: null,
    }),
  };
}

function makeProductDto(externalId: string) {
  return {
    reference: {
      providerCode: "test-provider",
      externalId,
      externalType: "product",
    },
    categoryReference: null,
    brandReference: null,
    sku: `SKU-${externalId}`,
    name: `Product ${externalId}`,
    slug: `product-${externalId.toLowerCase()}`,
    shortDescription: null,
    description: null,
    imageUrl: null,
    isActive: true,
    isVisible: true,
    metadata: {
      sourceReference: {
        providerCode: "test-provider",
        externalId,
        externalType: "product",
      },
      sourceUpdatedAt: null,
      importedAt: null,
    },
  };
}

function makeCategory(): CatalogCategoryDTO {
  return {
    reference: {
      providerCode: "test-provider",
      externalId: "C-1",
      externalType: "category",
    },
    parentReference: null,
    name: "Category",
    slug: "category",
    description: null,
    isActive: true,
    metadata: {
      sourceReference: {
        providerCode: "test-provider",
        externalId: "C-1",
        externalType: "category",
      },
      sourceUpdatedAt: null,
      importedAt: null,
    },
  };
}

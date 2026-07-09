import { describe, expect, it } from "vitest";

import { DefaultCatalogSyncEngine } from "../catalog-sync-engine";
import type { CatalogUpdaterService } from "../../../catalog/services";
import type { ERPProvider } from "../../contracts";
import type { CatalogCategoryDTO } from "../../dto";
import type { ReadModelUpdateResult } from "../sync-engine";

describe("DefaultCatalogSyncEngine", () => {
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

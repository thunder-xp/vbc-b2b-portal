import { describe, expect, it } from "vitest";

import { DefaultCatalogUpdaterService } from "../catalog-updater.service";
import type { CatalogRepository, CatalogUpsertResult } from "../../repositories";
import type {
  CatalogBrand,
  CatalogCategory,
  CatalogProduct,
  CatalogProductDocument,
  CatalogProductImage,
} from "../../types";

describe("DefaultCatalogUpdaterService", () => {
  it("upserts categories, brands, and products from neutral DTOs", async () => {
    const repository = new FakeCatalogRepository();
    const service = new DefaultCatalogUpdaterService(repository);

    const result = await service.updateCatalogReadModel({
      categories: [
        {
          reference: {
            providerCode: "one-c",
            externalId: "C-1",
            externalType: "category",
          },
          parentReference: null,
          name: "Video",
          slug: "video",
          description: null,
          isActive: true,
          metadata: {
            sourceReference: {
              providerCode: "one-c",
              externalId: "C-1",
              externalType: "category",
            },
            sourceUpdatedAt: null,
            importedAt: null,
          },
        },
      ],
      brands: [
        {
          reference: {
            providerCode: "one-c",
            externalId: "B-1",
            externalType: "brand",
          },
          name: "Novotech",
          slug: "novotech",
          description: null,
          logoUrl: null,
          isActive: true,
          metadata: {
            sourceReference: {
              providerCode: "one-c",
              externalId: "B-1",
              externalType: "brand",
            },
            sourceUpdatedAt: null,
            importedAt: null,
          },
        },
      ],
      products: [
        {
          reference: {
            providerCode: "one-c",
            externalId: "P-1",
            externalType: "product",
          },
          categoryReference: {
            providerCode: "one-c",
            externalId: "C-1",
            externalType: "category",
          },
          brandReference: {
            providerCode: "one-c",
            externalId: "B-1",
            externalType: "brand",
          },
          sku: "SKU-1",
          name: "Camera",
          slug: "camera",
          shortDescription: null,
          description: null,
          imageUrl: null,
          isActive: true,
          isVisible: true,
          metadata: {
            sourceReference: {
              providerCode: "one-c",
              externalId: "P-1",
              externalType: "product",
            },
            sourceUpdatedAt: null,
            importedAt: null,
          },
        },
      ],
    });

    expect(result).toMatchObject({
      created: 3,
      updated: 0,
      failed: 0,
    });
    expect(repository.products.get("P-1")?.categoryId).toBe("category-C-1");
    expect(repository.products.get("P-1")?.brandId).toBe("brand-B-1");
  });

  it("does not delete existing rows for empty input", async () => {
    const repository = new FakeCatalogRepository();
    repository.products.set("P-1", makeProduct("P-1"));
    const service = new DefaultCatalogUpdaterService(repository);

    const result = await service.updateCatalogReadModel({
      categories: [],
      brands: [],
      products: [],
    });

    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(repository.products.has("P-1")).toBe(true);
  });
});

class FakeCatalogRepository implements CatalogRepository {
  readonly categories = new Map<string, CatalogCategory>();
  readonly brands = new Map<string, CatalogBrand>();
  readonly products = new Map<string, CatalogProduct>();

  async listCategories(): Promise<CatalogCategory[]> {
    return [...this.categories.values()];
  }

  async listBrands(): Promise<CatalogBrand[]> {
    return [...this.brands.values()];
  }

  async listProducts(): Promise<CatalogProduct[]> {
    return [...this.products.values()];
  }

  async getProductBySlug(slug: string): Promise<CatalogProduct | null> {
    return [...this.products.values()].find((item) => item.slug === slug) ?? null;
  }

  async getProductById(id: string): Promise<CatalogProduct | null> {
    return [...this.products.values()].find((item) => item.id === id) ?? null;
  }

  async findCategoryByExternal1cId(
    external1cId: string,
  ): Promise<CatalogCategory | null> {
    return this.categories.get(external1cId) ?? null;
  }

  async findBrandByExternal1cId(
    external1cId: string,
  ): Promise<CatalogBrand | null> {
    return this.brands.get(external1cId) ?? null;
  }

  async findProductByExternal1cId(
    external1cId: string,
  ): Promise<CatalogProduct | null> {
    return this.products.get(external1cId) ?? null;
  }

  async findProductBySku(sku: string): Promise<CatalogProduct | null> {
    return [...this.products.values()].find((item) => item.sku === sku) ?? null;
  }

  async upsertCategory(input: {
    external1cId: string;
    parentId: string | null;
    name: string;
    slug: string;
    description: string | null;
    isActive: boolean;
  }): Promise<CatalogUpsertResult<CatalogCategory>> {
    const existing = this.categories.get(input.external1cId);
    const record: CatalogCategory = {
      id: existing?.id ?? `category-${input.external1cId}`,
      external1cId: input.external1cId,
      parentId: input.parentId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      sortOrder: 0,
      isActive: input.isActive,
      createdAt: now,
      updatedAt: now,
    };
    this.categories.set(input.external1cId, record);
    return { record, created: !existing };
  }

  async upsertBrand(input: {
    external1cId: string;
    name: string;
    slug: string;
    description: string | null;
    logoUrl: string | null;
    isActive: boolean;
  }): Promise<CatalogUpsertResult<CatalogBrand>> {
    const existing = this.brands.get(input.external1cId);
    const record: CatalogBrand = {
      id: existing?.id ?? `brand-${input.external1cId}`,
      external1cId: input.external1cId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      logoUrl: input.logoUrl,
      sortOrder: 0,
      isActive: input.isActive,
      createdAt: now,
      updatedAt: now,
    };
    this.brands.set(input.external1cId, record);
    return { record, created: !existing };
  }

  async upsertProduct(input: {
    external1cId: string;
    categoryId: string | null;
    brandId: string | null;
    sku: string;
    name: string;
    slug: string;
    shortDescription: string | null;
    description: string | null;
    imageUrl: string | null;
    isActive: boolean;
    isVisible: boolean;
  }): Promise<CatalogUpsertResult<CatalogProduct>> {
    const existing = this.products.get(input.external1cId);
    const record = makeProduct(input.external1cId, input);
    this.products.set(input.external1cId, record);
    return { record, created: !existing };
  }

  async listProductImages(): Promise<CatalogProductImage[]> {
    return [];
  }

  async listProductDocuments(): Promise<CatalogProductDocument[]> {
    return [];
  }
}

const now = "2026-07-09T00:00:00.000Z";

function makeProduct(
  external1cId: string,
  input: Partial<CatalogProduct> = {},
): CatalogProduct {
  return {
    id: input.id ?? `product-${external1cId}`,
    external1cId,
    categoryId: input.categoryId ?? null,
    brandId: input.brandId ?? null,
    sku: input.sku ?? "SKU",
    name: input.name ?? "Product",
    slug: input.slug ?? "product",
    shortDescription: input.shortDescription ?? null,
    description: input.description ?? null,
    imageUrl: input.imageUrl ?? null,
    isActive: input.isActive ?? true,
    isVisible: input.isVisible ?? true,
    sortOrder: input.sortOrder ?? 0,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

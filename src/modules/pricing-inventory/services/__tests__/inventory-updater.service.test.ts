import { describe, expect, it } from "vitest";

import type {
  CatalogRepository,
  CatalogUpsertResult,
} from "../../../catalog/repositories";
import type {
  CatalogBrand,
  CatalogCategory,
  CatalogProduct,
  CatalogProductDocument,
  CatalogProductImage,
} from "../../../catalog/types";
import type { StockBalanceDTO } from "../../../integration";
import { DefaultInventoryUpdaterService } from "../inventory-updater.service";
import type {
  FindProductPriceInput,
  FindProductStockBalanceInput,
  PricingInventoryRepository,
  PricingUpsertResult,
  UpsertProductPriceInput,
  UpsertProductStockBalanceInput,
} from "../../repositories";
import type { ProductPrice, ProductStockBalance } from "../../types";

describe("DefaultInventoryUpdaterService", () => {
  it("upserts imported stock for matched products", async () => {
    const repository = new FakePricingInventoryRepository();
    const service = new DefaultInventoryUpdaterService(
      repository,
      new FakeCatalogRepository(),
    );

    const result = await service.updateInventoryReadModel({
      stockBalances: [makeStockDto()],
    });

    expect(result).toMatchObject({
      created: 1,
      updated: 0,
      skipped: 0,
      failed: 0,
    });
    expect(repository.stockBalances[0]).toMatchObject({
      productId: "product-1",
      availableQuantity: 4,
      expectedQuantity: 10,
      warehouseName: "Main warehouse",
    });
  });

  it("skips stock when product cannot be matched", async () => {
    const service = new DefaultInventoryUpdaterService(
      new FakePricingInventoryRepository(),
      new FakeCatalogRepository({ includeProduct: false }),
    );

    const result = await service.updateInventoryReadModel({
      stockBalances: [makeStockDto()],
    });

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.warnings[0]).toContain("product PRODUCT-1 was not found");
  });

  it("does not delete existing stock for empty provider response", async () => {
    const repository = new FakePricingInventoryRepository();
    repository.stockBalances.push(makeStockBalance());
    const service = new DefaultInventoryUpdaterService(
      repository,
      new FakeCatalogRepository(),
    );

    const result = await service.updateInventoryReadModel({
      stockBalances: [],
    });

    expect(result).toMatchObject({
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    });
    expect(repository.stockBalances).toHaveLength(1);
  });
});

class FakePricingInventoryRepository implements PricingInventoryRepository {
  readonly stockBalances: ProductStockBalance[] = [];

  async listPricesForProducts(): Promise<ProductPrice[]> {
    return [];
  }

  async listStockForProducts(): Promise<ProductStockBalance[]> {
    return this.stockBalances;
  }

  async findProductPrice(
    _input: FindProductPriceInput,
  ): Promise<ProductPrice | null> {
    return null;
  }

  async upsertProductPrice(
    _input: UpsertProductPriceInput,
  ): Promise<PricingUpsertResult<ProductPrice>> {
    throw new Error("Not needed");
  }

  async findProductStockBalance(
    input: FindProductStockBalanceInput,
  ): Promise<ProductStockBalance | null> {
    return (
      this.stockBalances.find(
        (stockBalance) =>
          stockBalance.productId === input.productId &&
          stockBalance.warehouseName === input.warehouseName,
      ) ?? null
    );
  }

  async upsertProductStockBalance(
    input: UpsertProductStockBalanceInput,
  ): Promise<PricingUpsertResult<ProductStockBalance>> {
    const existing = await this.findProductStockBalance(input);
    const record = makeStockBalance(input);

    if (existing) {
      this.stockBalances.splice(this.stockBalances.indexOf(existing), 1, record);
    } else {
      this.stockBalances.push(record);
    }

    return { record, created: !existing };
  }
}

class FakeCatalogRepository implements CatalogRepository {
  constructor(private readonly options: { includeProduct?: boolean } = {}) {}

  async listCategories(): Promise<CatalogCategory[]> {
    return [];
  }

  async listBrands(): Promise<CatalogBrand[]> {
    return [];
  }

  async listProducts(): Promise<CatalogProduct[]> {
    return [];
  }

  async countProducts(): Promise<number> { return 0; }

  async getProductBySlug(): Promise<CatalogProduct | null> {
    return null;
  }

  async getProductById(): Promise<CatalogProduct | null> {
    return null;
  }

  async findCategoryByExternal1cId(): Promise<CatalogCategory | null> {
    return null;
  }

  async findBrandByExternal1cId(): Promise<CatalogBrand | null> {
    return null;
  }

  async findProductByExternal1cId(): Promise<CatalogProduct | null> {
    return this.options.includeProduct === false ? null : makeCatalogProduct();
  }

  async findProductBySku(): Promise<CatalogProduct | null> {
    return null;
  }

  async upsertCategory(): Promise<CatalogUpsertResult<CatalogCategory>> {
    throw new Error("Not needed");
  }

  async upsertBrand(): Promise<CatalogUpsertResult<CatalogBrand>> {
    throw new Error("Not needed");
  }

  async upsertProduct(): Promise<CatalogUpsertResult<CatalogProduct>> {
    throw new Error("Not needed");
  }

  async listProductImages(): Promise<CatalogProductImage[]> {
    return [];
  }

  async listProductDocuments(): Promise<CatalogProductDocument[]> {
    return [];
  }

  async listProductDocumentsForProducts(): Promise<CatalogProductDocument[]> { return []; }
}

const now = "2026-07-09T00:00:00.000Z";

function makeStockDto(): StockBalanceDTO {
  return {
    reference: {
      providerCode: "one-c",
      externalId: "STOCK-1",
      externalType: "stock-balance",
    },
    productReference: {
      providerCode: "one-c",
      externalId: "PRODUCT-1",
      externalType: "catalog-product",
    },
    warehouseReference: {
      providerCode: "one-c",
      externalId: "MAIN",
      externalType: "warehouse",
    },
    warehouseName: "Main warehouse",
    availableQuantity: 4,
    reservedQuantity: 1,
    expectedQuantity: 10,
    expectedAt: "2026-07-20T00:00:00.000Z",
    sourceUpdatedAt: now,
    isActive: true,
    metadata: {
      sourceReference: {
        providerCode: "one-c",
        externalId: "STOCK-1",
        externalType: "stock-balance",
      },
      sourceUpdatedAt: now,
      importedAt: null,
    },
  };
}

function makeStockBalance(
  input: Partial<UpsertProductStockBalanceInput> = {},
): ProductStockBalance {
  return {
    id: "stock-1",
    productId: input.productId ?? "product-1",
    warehouseName: input.warehouseName ?? "Main warehouse",
    availableQuantity: input.availableQuantity ?? 4,
    reservedQuantity: input.reservedQuantity ?? 1,
    expectedQuantity: input.expectedQuantity ?? 10,
    expectedAt: input.expectedAt ?? "2026-07-20T00:00:00.000Z",
    updatedFrom1cAt: input.updatedFrom1cAt ?? now,
    isActive: input.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  };
}

function makeCatalogProduct(): CatalogProduct {
  return {
    id: "product-1",
    external1cId: "PRODUCT-1",
    categoryId: null,
    brandId: null,
    sku: "SKU-1",
    name: "Product",
    slug: "product",
    shortDescription: null,
    description: null,
    imageUrl: null,
    isActive: true,
    isVisible: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
}

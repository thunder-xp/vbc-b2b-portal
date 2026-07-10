import { describe, expect, it } from "vitest";

import type { PartnerCompanyRepository } from "../../../access-control/repositories";
import { CompanyStatus, type PartnerCompany } from "../../../access-control/types";
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
import type { ProductPriceDTO } from "../../../integration";
import { DefaultPricingUpdaterService } from "../pricing-updater.service";
import type {
  FindProductPriceInput,
  FindProductStockBalanceInput,
  PricingInventoryRepository,
  PricingUpsertResult,
  UpsertProductStockBalanceInput,
  UpsertProductPriceInput,
} from "../../repositories";
import type { ProductPrice, ProductStockBalance } from "../../types";

describe("DefaultPricingUpdaterService", () => {
  it("upserts imported prices for matched products", async () => {
    const pricingRepository = new FakePricingInventoryRepository();
    const service = new DefaultPricingUpdaterService(
      pricingRepository,
      new FakeCatalogRepository(),
      new FakePartnerCompanyRepository(),
    );

    const result = await service.updatePricingReadModel({
      prices: [makePriceDto()],
    });

    expect(result).toMatchObject({
      created: 1,
      updated: 0,
      skipped: 0,
      failed: 0,
    });
    expect(pricingRepository.prices[0]).toMatchObject({
      productId: "product-1",
      companyId: null,
      priceAmount: 123.45,
      currency: "BGN",
    });
  });

  it("skips prices when product cannot be matched", async () => {
    const service = new DefaultPricingUpdaterService(
      new FakePricingInventoryRepository(),
      new FakeCatalogRepository({ includeProduct: false }),
      new FakePartnerCompanyRepository(),
    );

    const result = await service.updatePricingReadModel({
      prices: [makePriceDto()],
    });

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.warnings[0]).toContain("product PRODUCT-1 was not found");
  });

  it("does not delete existing prices for empty provider response", async () => {
    const repository = new FakePricingInventoryRepository();
    repository.prices.push(makeProductPrice());
    const service = new DefaultPricingUpdaterService(
      repository,
      new FakeCatalogRepository(),
      new FakePartnerCompanyRepository(),
    );

    const result = await service.updatePricingReadModel({ prices: [] });

    expect(result).toMatchObject({
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    });
    expect(repository.prices).toHaveLength(1);
  });

  it("skips partner-specific prices when partner company cannot be matched", async () => {
    const service = new DefaultPricingUpdaterService(
      new FakePricingInventoryRepository(),
      new FakeCatalogRepository(),
      new FakePartnerCompanyRepository({ includeCompany: false }),
    );

    const result = await service.updatePricingReadModel({
      prices: [makePriceDto({ partnerCompanyExternalId: "PARTNER-1" })],
    });

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.warnings[0]).toContain("partner company PARTNER-1 was not found");
  });
});

class FakePricingInventoryRepository implements PricingInventoryRepository {
  readonly prices: ProductPrice[] = [];

  async listPricesForProducts(): Promise<ProductPrice[]> {
    return this.prices;
  }

  async listStockForProducts(): Promise<ProductStockBalance[]> {
    return [];
  }

  async findProductPrice(
    input: FindProductPriceInput,
  ): Promise<ProductPrice | null> {
    return (
      this.prices.find(
        (price) =>
          price.productId === input.productId &&
          price.companyId === input.companyId &&
          price.external1cPriceTypeId === input.external1cPriceTypeId &&
          price.currency === input.currency &&
          price.validFrom === input.validFrom,
      ) ?? null
    );
  }

  async upsertProductPrice(
    input: UpsertProductPriceInput,
  ): Promise<PricingUpsertResult<ProductPrice>> {
    const existing = await this.findProductPrice(input);
    const record: ProductPrice = {
      id: existing?.id ?? `price-${this.prices.length + 1}`,
      productId: input.productId,
      companyId: input.companyId,
      external1cPriceTypeId: input.external1cPriceTypeId,
      currency: input.currency,
      priceAmount: input.priceAmount,
      validFrom: input.validFrom,
      validTo: input.validTo,
      isActive: input.isActive,
      createdAt: now,
      updatedAt: now,
    };

    if (existing) {
      this.prices.splice(this.prices.indexOf(existing), 1, record);
    } else {
      this.prices.push(record);
    }

    return { record, created: !existing };
  }

  async findProductStockBalance(
    _input: FindProductStockBalanceInput,
  ): Promise<ProductStockBalance | null> {
    return null;
  }

  async upsertProductStockBalance(
    _input: UpsertProductStockBalanceInput,
  ): Promise<PricingUpsertResult<ProductStockBalance>> {
    throw new Error("Not needed");
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
}

class FakePartnerCompanyRepository implements PartnerCompanyRepository {
  constructor(private readonly options: { includeCompany?: boolean } = {}) {}

  async findById(): Promise<PartnerCompany | null> {
    return null;
  }

  async findByExternal1cId(): Promise<PartnerCompany | null> {
    return this.options.includeCompany === false
      ? null
      : {
          id: "company-1",
          external1cId: "PARTNER-1",
          displayName: "Partner",
          status: CompanyStatus.Active,
          createdAt: now,
          updatedAt: now,
        };
  }

  async findCompaniesForUser(): Promise<PartnerCompany[]> {
    return [];
  }

  async create(): Promise<PartnerCompany> {
    throw new Error("Not needed");
  }

  async updateApprovalBinding(): Promise<PartnerCompany> {
    throw new Error("Not needed");
  }
}

const now = "2026-07-09T00:00:00.000Z";

function makePriceDto(options: { partnerCompanyExternalId?: string } = {}): ProductPriceDTO {
  return {
    reference: {
      providerCode: "one-c",
      externalId: "PRICE-1",
      externalType: "product-price",
    },
    productReference: {
      providerCode: "one-c",
      externalId: "PRODUCT-1",
      externalType: "catalog-product",
    },
    partnerCompanyReference:
      options.partnerCompanyExternalId === undefined
        ? null
        : {
            providerCode: "one-c",
            externalId: options.partnerCompanyExternalId,
            externalType: "partner-company",
          },
    priceTypeReference: {
      providerCode: "one-c",
      externalId: "BASE",
      externalType: "price-type",
    },
    money: {
      currency: "BGN",
      amount: 123.45,
    },
    validFrom: now,
    validTo: null,
    isActive: true,
    metadata: {
      sourceReference: {
        providerCode: "one-c",
        externalId: "PRICE-1",
        externalType: "product-price",
      },
      sourceUpdatedAt: now,
      importedAt: null,
    },
  };
}

function makeProductPrice(): ProductPrice {
  return {
    id: "price-existing",
    productId: "product-1",
    companyId: null,
    external1cPriceTypeId: "BASE",
    currency: "BGN",
    priceAmount: 100,
    validFrom: now,
    validTo: null,
    isActive: true,
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

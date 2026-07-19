import { describe, expect, it } from "vitest";

import type { CompanyAccessService } from "../../../access-control/services";
import { CompanyStatus, MembershipStatus, UserStatus, UserType } from "../../../access-control/types";
import type { CatalogRepository, ListCatalogProductsInput } from "../../repositories";
import type { CatalogBrand, CatalogCategory, CatalogProduct, CatalogProductAttribute, CatalogProductDocument } from "../../types";
import type { PricingInventoryService, ProductCommercialInternalDto } from "../../../pricing-inventory/services";
import { DefaultCatalogService } from "../catalog.service";

describe("DefaultCatalogService listing projection", () => {
  it("filters descendant categories and loads listing datasheets in one batch", async () => {
    const repository = new ListingRepository();
    const result = await new DefaultCatalogService(repository, companyAccessService).listProducts("user-1", { categoryId: "root", page: 1, pageSize: 12, sort: "default" });

    expect(repository.lastInput).toMatchObject({ categoryIds: ["root", "child", "leaf"], limit: 13, offset: 0 });
    expect(repository.productCalls).toBe(1);
    expect(repository.documentBatchCalls).toBe(1);
    expect(result.products[0]?.datasheet?.title).toBe("Datasheet");
    expect(result.totalCount).toBe(1);
    expect(result.hasNextPage).toBe(false);
  });

  it("promotes datasheetURL to a document and removes the raw characteristic", async () => {
    const result = await new DefaultCatalogService(new ListingRepository(true), companyAccessService).getProductDetailBySlug("user-1", "camera");

    expect(result?.datasheet).toMatchObject({ title: "Datasheet", documentType: "datasheet", url: "https://example.com/files/camera.pdf" });
    expect(result?.documents).toContainEqual(expect.objectContaining({ documentType: "datasheet", url: "https://example.com/files/camera.pdf" }));
    expect(result?.keyCharacteristics).toEqual([expect.objectContaining({ label: "Resolution", value: "4 MPX", isFilterable: true })]);
  });

  it("sorts the full filtered set before pagination with one bulk commercial read", async () => {
    const repository = new ListingRepository(false, [
      createProduct("product-low", "Low"),
      createProduct("product-missing", "Missing"),
      createProduct("product-high", "High"),
    ]);
    const pricing = new PricingServiceStub({
      "product-low": 10,
      "product-high": 30,
    });

    const result = await new DefaultCatalogService(
      repository,
      companyAccessService,
      pricing,
    ).listProducts("user-1", { page: 1, pageSize: 2, sort: "price_desc" });

    expect(result.products.map((item) => item.id)).toEqual(["product-high", "product-low"]);
    expect(result.hasNextPage).toBe(true);
    expect(result.commercialViews?.map((item) => item.productId)).toEqual([
      "product-low",
      "product-high",
    ]);
    expect(pricing.calls).toBe(1);
    expect(pricing.requestedProductIds).toEqual([
      "product-low",
      "product-missing",
      "product-high",
    ]);
    expect(repository.productCalls).toBe(1);
  });

  it("uses the partner page aggregate and enriches only the bounded page", async () => {
    const repository = new AggregateListingRepository();
    const pricing = new PricingServiceStub({ "product-high": 30, "product-low": 10 });

    const result = await new DefaultCatalogService(
      repository,
      companyAccessService,
      pricing,
    ).listProducts("user-1", {
      page: 1,
      pageSize: 2,
      sort: "price_desc",
      availability: "in_stock",
      attributeFilters: { "property_11111111-1111-1111-1111-111111111111": ["4 MPX"] },
    });

    expect(repository.aggregateInput).toMatchObject({
      companyId: "company",
      sort: "price_desc",
      availability: "in_stock",
      limit: 2,
      offset: 0,
      attributeFilters: { "property_11111111-1111-1111-1111-111111111111": ["4 MPX"] },
    });
    expect(repository.productCalls).toBe(0);
    expect(repository.documentBatchCalls).toBe(0);
    expect(pricing.calls).toBe(0);
    expect(result.products.map((item) => item.id)).toEqual(["product-high", "product-low"]);
    expect(result.totalCount).toBe(3);
    expect(result.hasNextPage).toBe(true);
    expect(result.commercialViews?.[0]?.partnerPrice?.amount).toBe(30);
    expect(result.commercialViews?.[0]?.retailPrice?.formattedAmount).toBe("1 770 MDL");
    expect(result.products[0]?.imageUrl).toBe("https://example.test/product-high.png");
    expect(result.products[0]).toMatchObject({ shortDescription: null, keyCharacteristics: [], datasheet: null });
  });

  it("does not wait for secondary facets when loading the product page", async () => {
    const repository = new AggregateListingRepository();
    repository.facetLoader = () => new Promise(() => undefined);

    const result = await new DefaultCatalogService(
      repository,
      companyAccessService,
    ).listProducts("user-1", { page: 1, pageSize: 12 });

    expect(result.products).toHaveLength(2);
    expect(result.facets).toEqual([]);
  });

  it("loads all visible facet groups through one bounded repository call", async () => {
    const repository = new AggregateListingRepository();
    const facetKey = "property_11111111-1111-1111-1111-111111111111";
    repository.facetLoader = async () => [
      { key: facetKey, label: "Resolution", value: "4 MP", count: 3, coverage: 5 },
      { key: facetKey, label: "Resolution", value: "8 MP", count: 2, coverage: 5 },
    ];

    const facets = await new DefaultCatalogService(
      repository,
      companyAccessService,
    ).listFacets("user-1", { attributeFilters: { [facetKey]: ["4 MP"] } });

    expect(repository.facetCalls).toBe(1);
    expect(facets).toEqual([{ key: facetKey, label: "Resolution", values: [
      { value: "4 MP", count: 3, selected: true },
      { value: "8 MP", count: 2, selected: false },
    ] }]);
  });
});

class ListingRepository implements CatalogRepository {
  constructor(
    private readonly detail = false,
    private readonly listingProducts: CatalogProduct[] = [product],
  ) {}
  productCalls = 0;
  documentBatchCalls = 0;
  lastInput: ListCatalogProductsInput | null = null;
  async listCategories() { return categories; }
  async listBrands() { return brands; }
  async listProducts(input: ListCatalogProductsInput) {
    this.productCalls += 1;
    this.lastInput = input;
    const offset = input.offset ?? 0;
    return input.limit === undefined
      ? this.listingProducts
      : this.listingProducts.slice(offset, offset + input.limit);
  }
  async countProducts() { return this.listingProducts.length; }
  async listProductDocumentsForProducts() { this.documentBatchCalls += 1; return [datasheet]; }
  async getProductBySlug(): Promise<CatalogProduct | null> { return this.detail ? product : null; }
  async getProductById() { return null; }
  async findCategoryByExternal1cId() { return null; }
  async findBrandByExternal1cId() { return null; }
  async findProductByExternal1cId() { return null; }
  async findProductBySku() { return null; }
  async upsertCategory(): Promise<never> { throw new Error("not used"); }
  async upsertBrand(): Promise<never> { throw new Error("not used"); }
  async upsertProduct(): Promise<never> { throw new Error("not used"); }
  async listProductImages() { return []; }
  async listProductDocuments() { return []; }
  async listProductAttributes(): Promise<CatalogProductAttribute[]> { return this.detail ? attributes : []; }
}

class AggregateListingRepository extends ListingRepository {
  aggregateInput: import("../../repositories").CatalogPartnerPageInput | null = null;
  facetCalls = 0;
  facetLoader: () => Promise<import("../../repositories/catalog.repository").CatalogFacetValueRecord[]> = async () => [];

  async listPartnerFacets() {
    this.facetCalls += 1;
    return this.facetLoader();
  }

  async listPartnerPage(input: import("../../repositories").CatalogPartnerPageInput) {
    this.aggregateInput = input;
    return {
      items: [
        aggregateProduct("product-high", "HIGH", "High", 30),
        aggregateProduct("product-low", "LOW", "Low", 10),
      ],
      totalCount: 3,
    };
  }
}

function aggregateProduct(id: string, sku: string, name: string, amount: number) {
  return {
    id,
    sku,
    name,
    slug: id,
    imageUrl: `https://example.test/${id}.png`,
    brand: null,
    category: null,
    commercialSnapshot: {
      productId: id,
      canViewStock: false,
      partnerPrice: { currency: "USD", currencyStatus: "resolved" as const, priceAmount: amount, updatedAt: now },
      msrpPrice: { currency: "USD", currencyStatus: "resolved" as const, priceAmount: 100, updatedAt: now },
      stock: null,
      supplierArrival: null,
      partnerRate: { rate: 17, publishedAt: now },
      retailRate: { rate: 17.7, publishedAt: now },
    },
  };
}

class PricingServiceStub implements PricingInventoryService {
  calls = 0;
  requestedProductIds: string[] = [];

  constructor(private readonly prices: Record<string, number>) {}

  async getProductCommercialViews(
    _userId: string,
    productIds: string[],
  ): Promise<ProductCommercialInternalDto[]> {
    this.calls += 1;
    this.requestedProductIds = productIds;
    return productIds.map((productId) => ({
      productId,
      partnerPrice: this.prices[productId] === undefined
        ? null
        : { currencyCode: "USD", amount: this.prices[productId], formattedAmount: null },
      retailPrice: null,
      commercialOpportunity: null,
      stock: null,
      isDemoData: false,
      retailBelowPartnerPrice: false,
    }));
  }
}

const now = "2026-07-11T00:00:00.000Z";
const categories: CatalogCategory[] = [
  { id: "root", external1cId: null, parentId: null, name: "Root", slug: "root", description: null, sortOrder: 0, isActive: true, createdAt: now, updatedAt: now },
  { id: "child", external1cId: null, parentId: "root", name: "Child", slug: "child", description: null, sortOrder: 0, isActive: true, createdAt: now, updatedAt: now },
  { id: "leaf", external1cId: null, parentId: "child", name: "Leaf", slug: "leaf", description: null, sortOrder: 0, isActive: true, createdAt: now, updatedAt: now },
];
const brands: CatalogBrand[] = [{ id: "brand", external1cId: null, name: "Brand", slug: "brand", description: null, logoUrl: null, sortOrder: 0, isActive: true, createdAt: now, updatedAt: now }];
const product: CatalogProduct = { id: "product", external1cId: "external", categoryId: "leaf", brandId: "brand", sku: "SKU", name: "Camera", slug: "camera", shortDescription: null, description: null, imageUrl: null, isActive: true, isVisible: true, sortOrder: 0, createdAt: now, updatedAt: now };
function createProduct(id: string, name: string): CatalogProduct {
  return { ...product, id, external1cId: `external-${id}`, sku: id, name, slug: id };
}
const datasheet: CatalogProductDocument = { id: "document", productId: "product", title: "Datasheet", documentType: "datasheet", url: "https://example.com/datasheet.pdf", sortOrder: 0, isActive: true, createdAt: now };
const attributes: CatalogProductAttribute[] = [
  { id: "attribute-1", productId: "product", propertyRef: "property-datasheet", key: "datasheet", label: "datasheetURL", rawValue: "https://example.com/files/camera.pdf", displayValue: "https://example.com/files/camera.pdf", resolvedDisplayValue: null, resolutionStatus: "not_required", valueType: "string", isFilterable: false, isVisible: true },
  { id: "attribute-2", productId: "product", propertyRef: "property-resolution", key: "resolution", label: "Resolution", rawValue: "4 MPX", displayValue: "4 MPX", resolvedDisplayValue: null, resolutionStatus: "not_required", valueType: "string", isFilterable: true, isVisible: true },
];
const companyAccessService: CompanyAccessService = {
  async getOwnMemberships() { return [{ id: "membership", userId: "user-1", companyId: "company", roleId: "role", status: MembershipStatus.Active, approvedBy: null, approvedAt: null, revokedBy: null, revokedAt: null, createdAt: now, updatedAt: now }]; },
  async getActiveCompanyContext() { return { user: { id: "user-1", email: "user@example.com", fullName: null, phone: null, status: UserStatus.Active, userType: UserType.Partner, createdAt: now, updatedAt: now }, company: { id: "company", external1cId: "external-company", external1cCode: null, external1cContractId: null, external1cPriceTypeId: null, displayName: "Company", status: CompanyStatus.Active, createdAt: now, updatedAt: now }, membership: (await this.getOwnMemberships("user-1"))[0]! }; },
  async validateCompanyAccess() { return { isAllowed: true, context: null }; },
  async ensureActiveMembership() { return (await this.getOwnMemberships("user-1"))[0]!; },
};

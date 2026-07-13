import { describe, expect, it } from "vitest";

import type { CompanyAccessService } from "../../../access-control/services";
import { CompanyStatus, MembershipStatus, UserStatus, UserType } from "../../../access-control/types";
import type { CatalogRepository, ListCatalogProductsInput } from "../../repositories";
import type { CatalogBrand, CatalogCategory, CatalogProduct, CatalogProductAttribute, CatalogProductDocument } from "../../types";
import { DefaultCatalogService } from "../catalog.service";

describe("DefaultCatalogService listing projection", () => {
  it("filters descendant categories and loads listing datasheets in one batch", async () => {
    const repository = new ListingRepository();
    const result = await new DefaultCatalogService(repository, companyAccessService).listProducts("user-1", { categoryId: "root", page: 1, pageSize: 12, sort: "sku_asc" });

    expect(repository.lastInput).toMatchObject({ categoryIds: ["root", "child", "leaf"], sort: "sku_asc", limit: 13, offset: 0 });
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
    expect(result?.keyCharacteristics).toEqual([{ label: "Resolution", value: "4 MPX" }]);
  });
});

class ListingRepository implements CatalogRepository {
  constructor(private readonly detail = false) {}
  productCalls = 0;
  documentBatchCalls = 0;
  lastInput: ListCatalogProductsInput | null = null;
  async listCategories() { return categories; }
  async listBrands() { return brands; }
  async listProducts(input: ListCatalogProductsInput) { this.productCalls += 1; this.lastInput = input; return [product]; }
  async countProducts() { return 1; }
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

const now = "2026-07-11T00:00:00.000Z";
const categories: CatalogCategory[] = [
  { id: "root", external1cId: null, parentId: null, name: "Root", slug: "root", description: null, sortOrder: 0, isActive: true, createdAt: now, updatedAt: now },
  { id: "child", external1cId: null, parentId: "root", name: "Child", slug: "child", description: null, sortOrder: 0, isActive: true, createdAt: now, updatedAt: now },
  { id: "leaf", external1cId: null, parentId: "child", name: "Leaf", slug: "leaf", description: null, sortOrder: 0, isActive: true, createdAt: now, updatedAt: now },
];
const brands: CatalogBrand[] = [{ id: "brand", external1cId: null, name: "Brand", slug: "brand", description: null, logoUrl: null, sortOrder: 0, isActive: true, createdAt: now, updatedAt: now }];
const product: CatalogProduct = { id: "product", external1cId: "external", categoryId: "leaf", brandId: "brand", sku: "SKU", name: "Camera", slug: "camera", shortDescription: null, description: null, imageUrl: null, isActive: true, isVisible: true, sortOrder: 0, createdAt: now, updatedAt: now };
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

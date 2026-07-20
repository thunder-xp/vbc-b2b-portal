import { describe, expect, it, vi } from "vitest";

import type { CompanyAccessService } from "../../../access-control/services";
import type { CatalogRepository } from "../../repositories";
import { DefaultCatalogService } from "../catalog.service";

describe("catalog product detail performance", () => {
  it("uses one repository aggregate instead of independent brand, category, image, document, and attribute reads", async () => {
    const aggregate = vi.fn().mockResolvedValue({
      product: product,
      brand: null,
      category: null,
      images: [],
      documents: [],
      attributes: [],
    });
    const repository = {
      getProductDetailAggregateById: aggregate,
      listBrands: vi.fn(),
      listCategories: vi.fn(),
      listProductImages: vi.fn(),
      listProductDocuments: vi.fn(),
      listProductAttributes: vi.fn(),
    } as unknown as CatalogRepository;
    const access = {
      getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: "company-1", status: "active" }]),
      getActiveCompanyContext: vi.fn().mockResolvedValue({}),
    } as unknown as CompanyAccessService;

    const result = await new DefaultCatalogService(repository, access).getProductDetailById("user-1", product.id);

    expect(result?.id).toBe(product.id);
    expect(aggregate).toHaveBeenCalledOnce();
    expect(repository.listBrands).not.toHaveBeenCalled();
    expect(repository.listCategories).not.toHaveBeenCalled();
    expect(repository.listProductImages).not.toHaveBeenCalled();
    expect(repository.listProductDocuments).not.toHaveBeenCalled();
    expect(repository.listProductAttributes).not.toHaveBeenCalled();
  });

  it("passes a bounded tab projection to the aggregate repository", async () => {
    const aggregate = vi.fn().mockResolvedValue({ product, brand: null, category: null, images: [], documents: [], attributes: [] });
    const repository = { getProductDetailAggregateById: aggregate } as unknown as CatalogRepository;
    const access = {
      getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: "company-1", status: "active" }]),
      getActiveCompanyContext: vi.fn().mockResolvedValue({}),
    } as unknown as CompanyAccessService;
    const projection = { includeAttributes: false, includeDocuments: false, includeImages: true };

    await new DefaultCatalogService(repository, access).getProductDetailById("user-1", product.id, projection);

    expect(aggregate).toHaveBeenCalledWith(product.id, projection);
  });
});

const product = {
  id: "product-1",
  external1cId: "external-1",
  categoryId: null,
  brandId: null,
  sku: "NV-100",
  name: "Camera",
  slug: "camera",
  shortDescription: null,
  description: null,
  imageUrl: null,
  isActive: true,
  isVisible: true,
  sortOrder: 0,
  createdAt: "2026-07-18T00:00:00Z",
  updatedAt: "2026-07-18T00:00:00Z",
};

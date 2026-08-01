import { describe, expect, it, vi } from "vitest";

import type { CompanyAccessService } from "../../../access-control/services";
import type { CatalogRepository } from "../../repositories";
import type { CatalogProduct } from "../../types";
import { DefaultCatalogService } from "../catalog.service";

describe("catalog product reference projection", () => {
  it("resolves product-row image, first active image fallback, and a safe missing state in two batched reads", async () => {
    const products = [
      product("product-1", "https://storage.googleapis.com/novotech-systems-5449b.appspot.com/primary.jpg"),
      product("product-2", null),
      product("product-3", null),
    ];
    const repository = {
      listProducts: vi.fn().mockResolvedValue(products),
      listProductImagesForProducts: vi.fn().mockResolvedValue([
        { id: "image-2", productId: "product-2", url: "/products/fallback.jpg", altText: null, sortOrder: 0, isPrimary: true, createdAt: "2026-08-01T00:00:00Z" },
      ]),
    } as unknown as CatalogRepository;
    const access = {
      getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: "company-1", status: "active" }]),
      getActiveCompanyContext: vi.fn().mockResolvedValue({}),
    } as unknown as CompanyAccessService;

    const result = await new DefaultCatalogService(repository, access)
      .getProductReferencesByIds("user-1", ["product-1", "product-2", "product-3", "product-2"]);

    expect(result.map((item) => item.thumbnail)).toEqual([
      "https://storage.googleapis.com/novotech-systems-5449b.appspot.com/primary.jpg",
      "/products/fallback.jpg",
      null,
    ]);
    expect(repository.listProducts).toHaveBeenCalledOnce();
    expect(repository.listProductImagesForProducts).toHaveBeenCalledOnce();
    expect(result.every((item) => item.publicationState === "published")).toBe(true);
  });

  it("excludes inactive and unpublished products", async () => {
    const repository = {
      listProducts: vi.fn().mockResolvedValue([
        { ...product("inactive", null), isActive: false },
        { ...product("hidden", null), isVisible: false },
      ]),
      listProductImagesForProducts: vi.fn().mockResolvedValue([]),
    } as unknown as CatalogRepository;
    const access = {
      getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: "company-1", status: "active" }]),
      getActiveCompanyContext: vi.fn().mockResolvedValue({}),
    } as unknown as CompanyAccessService;
    await expect(new DefaultCatalogService(repository, access)
      .getProductReferencesByIds("user-1", ["inactive", "hidden"]))
      .resolves.toEqual([]);
  });
});

function product(id: string, imageSourceUrl: string | null): CatalogProduct {
  return {
    id,
    external1cId: `${id}-1c`,
    categoryId: null,
    brandId: null,
    sku: id,
    name: `Product ${id}`,
    slug: id,
    shortDescription: null,
    description: null,
    imageUrl: null,
    imageSourceUrl,
    isActive: true,
    isVisible: true,
    sortOrder: 0,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
  };
}

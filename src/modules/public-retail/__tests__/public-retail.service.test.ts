import { describe, expect, it, vi } from "vitest";

import type { PublicRetailReadRepository } from "../repositories/public-retail.repository";
import { PublicRetailService } from "../services/public-retail.service";
import {
  parsePublicRetailProduct,
  parsePublicRetailProductPage,
} from "../validation";

const publicId = "8d4fe3a1-3d8a-4fa0-9b0c-87df948fe07f";
const safeImage = "https://storage.googleapis.com/novotech-systems-5449b.appspot.com/products/camera.webp";

function summary() {
  return {
    id: publicId,
    slug: "camera-one",
    sku: "CAM-1",
    name: "Camera",
    shortDescription: null,
    image: { url: safeImage, alt: "Camera" },
    brand: { slug: "brand", name: "Brand" },
    category: { slug: "cameras", name: "Cameras" },
    price: { amount: 100, currency: "MDL", vatPresentation: "not_specified" },
    availability: "in_stock",
    highlights: [],
    calculatorEligible: true,
  } as const;
}

describe("PublicRetailService", () => {
  it("uses one bounded repository call without partner context", async () => {
    const listProducts = vi.fn().mockResolvedValue({ items: [], totalCount: 0, limit: 48, offset: 96 });
    const repository = {
      listCategories: vi.fn(),
      listProducts,
      getProduct: vi.fn(),
      listFacets: vi.fn(),
    } as PublicRetailReadRepository;

    await new PublicRetailService(repository).listRetailProducts({
      locale: "ro",
      categorySlug: "camere-video",
      search: "  camera   ip  ",
      availability: "in_stock",
      facets: { resolution: [" 4 MP ", "4 MP"] },
      page: 3,
      pageSize: 48,
    });

    expect(listProducts).toHaveBeenCalledOnce();
    expect(listProducts).toHaveBeenCalledWith({
      locale: "ro",
      categorySlug: "camere-video",
      search: "camera ip",
      availability: "in_stock",
      facets: { resolution: ["4 MP"] },
      limit: 48,
      offset: 96,
    });
    expect(listProducts.mock.calls[0]?.[0]).not.toHaveProperty("companyId");
    expect(listProducts.mock.calls[0]?.[0]).not.toHaveProperty("userId");
  });

  it("falls back to Russian and rejects unbounded input", async () => {
    const repository = {
      listCategories: vi.fn(), listProducts: vi.fn().mockResolvedValue({}),
      getProduct: vi.fn(), listFacets: vi.fn(),
    } as unknown as PublicRetailReadRepository;
    const service = new PublicRetailService(repository);

    await service.listRetailProducts({ locale: "en", pageSize: 500, page: 500 });
    expect(repository.listProducts).toHaveBeenCalledWith(expect.objectContaining({
      locale: "ru", limit: 24, offset: 0,
    }));
    expect(() => service.listRetailProducts({ search: "x".repeat(101) })).toThrow();
  });
});

describe("Public Retail DTO allowlist", () => {
  it("accepts the narrow public summary and detail contracts", () => {
    expect(parsePublicRetailProductPage({ items: [summary()], totalCount: 1, limit: 24, offset: 0 }).items).toHaveLength(1);
    expect(parsePublicRetailProduct({
      ...summary(), description: "Description", categoryPath: [], gallery: [], specifications: [],
    }).id).toBe(publicId);
  });

  it.each(["external_1c_id", "company_id", "partner_price", "available_quantity", "warehouse_name"])(
    "rejects sensitive or internal field %s",
    (field) => {
      expect(() => parsePublicRetailProductPage({
        items: [{ ...summary(), [field]: "leak" }], totalCount: 1, limit: 24, offset: 0,
      })).toThrow();
    },
  );

  it("rejects media outside the governed product path", () => {
    expect(() => parsePublicRetailProductPage({
      items: [{ ...summary(), image: { url: "https://example.com/private.jpg", alt: "Private" } }],
      totalCount: 1, limit: 24, offset: 0,
    })).toThrow();
  });
});

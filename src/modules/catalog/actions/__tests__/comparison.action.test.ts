import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserId: vi.fn(),
  getProducts: vi.fn(),
  getCommercialViews: vi.fn(),
  getAssignments: vi.fn(),
}));

vi.mock("../../../access-control/actions/service-factory", () => ({
  getAuthenticatedUserId: mocks.getAuthenticatedUserId,
  createCompanyAccessService: () => ({}),
}));
vi.mock("../../../pricing-inventory/actions/service-factory", () => ({
  createPricingInventoryService: () => ({
    getProductCommercialViews: mocks.getCommercialViews,
  }),
}));
vi.mock("../../../merchandising/actions", () => ({
  createMerchandisingService: () => ({
    listPublishedForProducts: mocks.getAssignments,
  }),
}));
vi.mock("../../repositories/supabase", () => ({
  SupabaseCatalogRepository: class {},
}));
vi.mock("../../services", () => ({
  DefaultCatalogService: class {
    getComparisonProductsByIds = mocks.getProducts;
  },
}));

import { getCatalogComparisonAction } from "../comparison.action";

const PRODUCT_ONE = "11111111-1111-4111-8111-111111111111";
const PRODUCT_TWO = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedUserId.mockResolvedValue("user-1");
  mocks.getProducts.mockResolvedValue([
    product(PRODUCT_ONE, "category-one"),
    product(PRODUCT_TWO, "category-two"),
  ]);
  mocks.getCommercialViews.mockResolvedValue([]);
  mocks.getAssignments.mockResolvedValue([]);
});

describe("getCatalogComparisonAction", () => {
  it("loads mixed-category products through one bounded product and commercial read", async () => {
    const result = await getCatalogComparisonAction([PRODUCT_ONE, PRODUCT_TWO]);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.products).toHaveLength(2);
    expect(result.data.mixedCategories).toBe(true);
    expect(mocks.getProducts).toHaveBeenCalledOnce();
    expect(mocks.getProducts).toHaveBeenCalledWith(
      "user-1",
      [PRODUCT_ONE, PRODUCT_TWO],
    );
    expect(mocks.getCommercialViews).toHaveBeenCalledOnce();
  });

  it("excludes unavailable products without failing the complete comparison", async () => {
    mocks.getProducts.mockResolvedValue([product(PRODUCT_ONE, "category-one")]);

    const result = await getCatalogComparisonAction([PRODUCT_ONE, PRODUCT_TWO]);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.excludedProductCount).toBe(1);
    expect(result.data.warnings).toContain("COMPARISON_PRODUCT_UNAVAILABLE");
    expect(mocks.getCommercialViews).toHaveBeenCalledWith("user-1", [PRODUCT_ONE]);
  });

  it("degrades optional commercial enrichment without leaking internal diagnostics", async () => {
    mocks.getCommercialViews.mockRejectedValue(new Error("database detail"));

    const result = await getCatalogComparisonAction([PRODUCT_ONE, PRODUCT_TWO]);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.products).toHaveLength(2);
    expect(result.data.commercialViews).toEqual([]);
    expect(result.data.warnings).toContain("COMPARISON_ENRICHMENT_FAILED");
  });

  it("rejects malformed IDs and comparison sets over the limit", async () => {
    const malformed = await getCatalogComparisonAction(["not-a-product-id"]);
    const tooMany = await getCatalogComparisonAction([
      PRODUCT_ONE,
      PRODUCT_TWO,
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ]);

    expect(malformed).toMatchObject({
      success: false,
      errorCode: "COMPARISON_SCOPE_INVALID",
    });
    expect(tooMany).toMatchObject({
      success: false,
      errorCode: "COMPARISON_SCOPE_INVALID",
    });
    expect(mocks.getProducts).not.toHaveBeenCalled();
  });
});

function product(id: string, categoryId: string) {
  return {
    id,
    sku: id,
    name: id,
    slug: id,
    shortDescription: null,
    imageUrl: null,
    brand: null,
    category: {
      id: categoryId,
      parentId: null,
      name: categoryId,
      slug: categoryId,
      description: null,
    },
    keyCharacteristics: [],
    datasheet: null,
  };
}

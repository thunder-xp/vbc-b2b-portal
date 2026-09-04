import { beforeEach, describe, expect, it, vi } from "vitest";

const { listProducts } = vi.hoisted(() => ({ listProducts: vi.fn() }));
vi.mock("@/src/modules/catalog/actions/list-products.action", () => ({
  listCatalogProductsAction: listProducts,
}));

import { GET } from "../route";

const result = {
  products: [{
    id: "product-1",
    sku: "400540",
    name: "DH-C4K-P",
    slug: "dh-c4k-p",
    imageUrl: null,
    category: { id: "category-1", parentId: null, name: "Video", slug: "video", description: null },
    brand: null,
    shortDescription: null,
    keyCharacteristics: [],
    datasheet: null,
  }],
  commercialViews: [{ productId: "product-1", partnerPrice: { formattedAmount: "$50.60" }, stock: { exactAvailableQuantity: 492 } }],
  page: 1,
  pageSize: 8,
  hasNextPage: false,
  totalCount: 1,
  isDemoData: false,
  facets: [],
};

describe("quick product search route", () => {
  beforeEach(() => listProducts.mockReset());

  it("uses the authenticated catalog action without accepting browser company identity", async () => {
    listProducts.mockResolvedValue({ success: true, data: result });
    const response = await GET(new Request("https://portal.test/api/catalog/quick-search?q=400540&companyId=other-company"));
    const body = await response.json();

    expect(listProducts).toHaveBeenCalledWith({ page: 1, pageSize: 8, search: "400540", sort: "default" });
    expect(listProducts.mock.calls[0][0]).not.toHaveProperty("companyId");
    expect(body.data[0]).toMatchObject({ id: "product-1", matchKind: "exact_sku" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("server-timing")).toMatch(/^quick-product-search;dur=/);
  });

  it("uses one bounded fallback query for a normalized model and never auto-selects it", async () => {
    listProducts
      .mockResolvedValueOnce({ success: true, data: { ...result, products: [], commercialViews: [], totalCount: 0 } })
      .mockResolvedValueOnce({ success: true, data: { ...result, products: [{ ...result.products[0], name: "PFA130-E" }] } });

    const response = await GET(new Request("https://portal.test/api/catalog/quick-search?q=PFA130E"));
    const body = await response.json();
    expect(listProducts).toHaveBeenNthCalledWith(2, { page: 1, pageSize: 24, search: "pfa130", sort: "default" });
    expect(body.data[0].matchKind).toBe("normalized_model");
    expect(body.data).toHaveLength(1);
  });
});

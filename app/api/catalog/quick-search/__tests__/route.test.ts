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
  commercialViews: [{
    productId: "product-1",
    partnerPrice: { currencyCode: "USD", amount: 50.6, formattedAmount: "$50.60" },
    partnerPriceMdl: { currencyCode: "MDL", amount: 865, formattedAmount: "865 MDL" },
    msrpPriceUsd: { currencyCode: "USD", amount: 75, formattedAmount: "$75.00" },
    retailPrice: { currencyCode: "MDL", amount: 1_332, formattedAmount: "1 332 MDL" },
    stock: { exactAvailableQuantity: 492 },
  }],
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
    expect(body.data[0].commercialView).toMatchObject({
      partnerPrice: { formattedAmount: "$50.60" },
      partnerPriceMdl: { formattedAmount: "865 MDL" },
      retailPriceMdl: { formattedAmount: "1 332 MDL" },
      retailPriceUsd: { formattedAmount: "$75.00" },
      stock: { exactAvailableQuantity: 492 },
    });
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

  it("projects retail prices for a full result page without per-product calls", async () => {
    const products = Array.from({ length: 8 }, (_, index) => ({
      ...result.products[0],
      id: `product-${index + 1}`,
      sku: `40054${index}`,
    }));
    const commercialViews = products.map((product) => ({
      ...result.commercialViews[0],
      productId: product.id,
    }));
    listProducts.mockResolvedValue({
      success: true,
      data: { ...result, products, commercialViews, totalCount: products.length },
    });

    const response = await GET(new Request("https://portal.test/api/catalog/quick-search?q=40054"));
    const body = await response.json();

    expect(listProducts).toHaveBeenCalledTimes(1);
    expect(body.data).toHaveLength(8);
    expect(body.data.every((item: { commercialView: { retailPriceMdl: unknown; retailPriceUsd: unknown } }) =>
      item.commercialView.retailPriceMdl && item.commercialView.retailPriceUsd)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import type { ProductCommercialViewDto } from "../../../pricing-inventory/services";
import type { CatalogProduct } from "../../types";
import {
  CATALOG_SORT_OPTIONS,
  sortCatalogProducts,
  type CatalogSort,
} from "../catalog-sorting";

describe("catalog sorting", () => {
  it("exposes exactly the seven Russian sorting labels", () => {
    expect(CATALOG_SORT_OPTIONS.map((option) => option.label)).toEqual([
      "По умолчанию",
      "По наличию А–Я",
      "По наличию Я–А",
      "По цене А–Я",
      "По цене Я–А",
      "По наценке А–Я",
      "По наценке Я–А",
    ]);
  });

  it("keeps the existing order for default sorting", () => {
    expect(sort("default")).toEqual(["stock-missing", "low", "high"]);
  });

  it.each([
    ["availability_asc", ["low", "high", "stock-missing"]],
    ["availability_desc", ["high", "low", "stock-missing"]],
    ["price_asc", ["low", "high", "stock-missing"]],
    ["price_desc", ["high", "low", "stock-missing"]],
    ["markup_asc", ["low", "high", "stock-missing"]],
    ["markup_desc", ["high", "low", "stock-missing"]],
  ] satisfies Array<[CatalogSort, string[]]>) (
    "%s sorts valid values and keeps unavailable values last",
    (catalogSort, expected) => {
      expect(sort(catalogSort)).toEqual(expected);
    },
  );

  it("uses normalized product name and id as deterministic tie-breakers", () => {
    const tiedViews = views.map((view) => ({
      ...view,
      partnerPrice: view.partnerPrice ? { ...view.partnerPrice, amount: 10 } : null,
    }));
    const tiedProducts = [product("b", "Камера"), product("a", "Камера")];

    expect(sortCatalogProducts(tiedProducts, tiedViews, "price_asc").map((item) => item.id)).toEqual(["a", "b"]);
  });
});

function sort(catalogSort: CatalogSort): string[] {
  return sortCatalogProducts(products, views, catalogSort).map((item) => item.id);
}

const products = [
  product("stock-missing", "Missing"),
  product("low", "Low"),
  product("high", "High"),
];

const views: ProductCommercialViewDto[] = [
  commercialView("stock-missing", null, null, null),
  commercialView("low", 2, 10, 5),
  commercialView("high", 8, 30, 25),
];

function product(id: string, name: string): CatalogProduct {
  return {
    id,
    external1cId: `external-${id}`,
    categoryId: null,
    brandId: null,
    sku: id,
    name,
    slug: id,
    shortDescription: null,
    description: null,
    imageUrl: null,
    isActive: true,
    isVisible: true,
    sortOrder: 0,
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
  };
}

function commercialView(
  productId: string,
  quantity: number | null,
  price: number | null,
  markup: number | null,
): ProductCommercialViewDto {
  return {
    productId,
    partnerPrice: price === null ? null : { amount: price, currencyCode: "USD", formattedAmount: null },
    retailPrice: null,
    commercialOpportunity: markup === null ? null : {
      retailPriceUsd: 0,
      grossProfitUsd: 0,
      markupPercent: markup,
      formattedGrossProfit: "",
      formattedMarkup: "",
    },
    stock: quantity === null ? null : {
      status: "in_stock",
      label: "",
      exactAvailableQuantity: quantity,
      exactPhysicalQuantity: quantity,
      exactReservedQuantity: 0,
      exactIncomingQuantity: 0,
      expectedArrival: null,
      hasVariantStock: false,
      lastUpdatedAt: null,
    },
    isDemoData: false,
  };
}

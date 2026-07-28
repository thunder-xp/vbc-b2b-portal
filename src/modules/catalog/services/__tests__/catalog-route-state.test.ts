import { describe, expect, it } from "vitest";

import { parseCatalogRouteState } from "../catalog-route-state";

const attributeKey = "property_11111111-1111-4111-8111-111111111111";

describe("parseCatalogRouteState", () => {
  it("uses curated mode for the canonical route and ignores pagination alone", () => {
    expect(parseCatalogRouteState(undefined)).toMatchObject({ mode: "curated", page: 1 });
    expect(parseCatalogRouteState({ page: "9" })).toMatchObject({ mode: "curated", page: 1 });
  });

  it.each([
    [{ search: "camera" }, "search"],
    [{ category: "category-id" }, "category"],
    [{ brand: "brand-id" }, "brand"],
    [{ availability: "in_stock" }, "availability"],
    [{ label: "TOP" }, "label"],
    [{ sort: "price_desc" }, "sort"],
    [{ view: "all" }, "explicit all"],
    [{ [`attr.${attributeKey}`]: "4 MP" }, "technical filter"],
  ])("activates discovery mode for $1", (params, _label) => {
    expect(parseCatalogRouteState(params).mode).toBe("discovery");
  });

  it("normalizes invalid and empty inputs without entering discovery mode", () => {
    expect(parseCatalogRouteState({
      availability: "unknown",
      label: "SALE",
      page: "-2",
      search: " ",
      sort: "unsupported",
      view: "grid",
      "attr.unsafe": "value",
    })).toMatchObject({
      attributeFilters: {},
      availability: "all",
      explicitAll: false,
      mode: "curated",
      page: 1,
      sort: "default",
    });
  });

  it("preserves validated discovery state and page", () => {
    expect(parseCatalogRouteState({
      availability: "expected",
      category: " category-id ",
      page: "3",
      search: " dome ",
      [`attr.${attributeKey}`]: "PoE,PoE",
    })).toEqual({
      attributeFilters: { [attributeKey]: ["PoE"] },
      availability: "expected",
      brandId: undefined,
      categoryId: "category-id",
      explicitAll: false,
      merchandisingLabel: undefined,
      mode: "discovery",
      page: 3,
      search: "dome",
      sort: "default",
    });
  });
});

import { describe, expect, it } from "vitest";

import { parseCatalogRouteState } from "../catalog-route-state";

const attributeKey = "property_11111111-1111-4111-8111-111111111111";

describe("parseCatalogRouteState", () => {
  it("uses curated mode for the canonical route and ignores pagination alone", () => {
    expect(parseCatalogRouteState(undefined)).toMatchObject({ mode: "curated", page: 1 });
    expect(parseCatalogRouteState({ page: "9" })).toMatchObject({ mode: "curated", page: 1 });
  });

  for (const [label, params] of Object.entries({
    search: { search: "camera" },
    category: { category: "category-id" },
    categories: { categories: "11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222" },
    "category set": { categorySet: "security" },
    brand: { brand: "brand-id" },
    availability: { availability: "in_stock" },
    label: { label: "TOP" },
    collection: { collection: "replenishment" },
    sort: { sort: "price_desc" },
    "explicit all": { view: "all" },
    "technical filter": { [`attr.${attributeKey}`]: "4 MP" },
  })) {
    it(`activates discovery mode for ${label}`, () => {
      expect(parseCatalogRouteState(params).mode).toBe("discovery");
    });
  }

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
      collection: undefined,
      categoryId: "category-id",
      categoryIds: [],
      categorySet: undefined,
      explicitAll: false,
      merchandisingLabel: undefined,
      mode: "discovery",
      page: 3,
      period: 365,
      periodState: null,
      popularPeriodState: null,
      newPeriodState: null,
      hotPeriodState: null,
      search: "dome",
      sort: "default",
    });
  });

  it("accepts only canonical category-set codes and gives a direct category precedence", () => {
    expect(parseCatalogRouteState({ categorySet: "network" })).toMatchObject({ categorySet: "network", mode: "discovery" });
    expect(parseCatalogRouteState({ categorySet: "unknown" }).categorySet).toBeUndefined();
    expect(parseCatalogRouteState({ category: "category-id", categorySet: "network" })).toMatchObject({ categoryId: "category-id", categorySet: undefined });
  });

  it("parses, deduplicates, and sorts bounded canonical root category IDs", () => {
    const first = "11111111-1111-4111-8111-111111111111";
    const second = "22222222-2222-4222-8222-222222222222";
    expect(parseCatalogRouteState({ categories: `${second},bad,${first},${second}` })).toMatchObject({
      categoryIds: [first, second],
      categorySet: undefined,
      mode: "discovery",
    });
  });

  it("treats replenishment as a first-class collection and ignores a conflicting label", () => {
    expect(parseCatalogRouteState({ collection: "replenishment", label: "HOT", page: "2" })).toMatchObject({
      collection: "replenishment",
      merchandisingLabel: undefined,
      mode: "discovery",
      page: 2,
    });
  });

  it("defaults all automated selections to hidden 365 and accepts shorter slices", () => {
    expect(parseCatalogRouteState({ label: "NEW" })).toMatchObject({ period: 365 });
    expect(parseCatalogRouteState({ label: "NEW", period: "60" })).toMatchObject({ period: 60 });
    expect(parseCatalogRouteState({ label: "TOP", period: "365" })).toMatchObject({ period: 365, periodState: null });
    expect(parseCatalogRouteState({ label: "HOT" })).toMatchObject({ period: 365, periodState: null });
    expect(parseCatalogRouteState({ label: "HOT", period: "90" })).toMatchObject({ period: 90, periodState: 90 });
  });
});

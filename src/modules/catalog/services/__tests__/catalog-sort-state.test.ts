import { describe, expect, it } from "vitest";
import { buildCatalogSortHiddenFields } from "../catalog-sort-state";
import { deduplicateCatalogFacets } from "../catalog.service";

const keyA = "property_11111111-1111-4111-8111-111111111111";
const keyB = "property_22222222-2222-4222-8222-222222222222";

describe("buildCatalogSortHiddenFields", () => {
  it("preserves category, search, and one attribute while omitting page", () => {
    expect(buildCatalogSortHiddenFields({ categoryId: " cameras ", availability: "expected", search: " dome ", attributeFilters: { [keyA]: ["4 MP"] } })).toEqual([
      { name: "category", value: "cameras" }, { name: "search", value: "dome" }, { name: "availability", value: "expected" }, { name: `attr.${keyA}`, value: "4 MP" },
    ]);
  });

  it("preserves multiple groups and deduplicates values", () => {
    expect(buildCatalogSortHiddenFields({ attributeFilters: { [keyB]: ["Да"], [keyA]: ["4 MP", "4 MP", "8 MP"] } })).toEqual([
      { name: `attr.${keyA}`, value: "4 MP,8 MP" }, { name: `attr.${keyB}`, value: "Да" },
    ]);
  });

  it("does not preserve unsupported attribute keys or empty values", () => {
    expect(buildCatalogSortHiddenFields({ attributeFilters: { unsafe: ["value"], [keyA]: [" "] } })).toEqual([]);
  });

  it("omits the default availability state so sorting resets to page one cleanly", () => {
    expect(buildCatalogSortHiddenFields({ availability: "all", attributeFilters: {} })).toEqual([]);
  });

  it("deduplicates characteristic groups by display label and preserves an active selection", () => {
    const facets = deduplicateCatalogFacets([
      { key: keyA, label: "Материал", values: [{ value: "Металл", count: 8, selected: false }] },
      { key: keyB, label: " материал ", values: [{ value: "Пластик", count: 2, selected: true }] },
    ]);

    expect(facets).toEqual([{ key: keyB, label: " материал ", values: [{ value: "Пластик", count: 2, selected: true }] }]);
  });
});

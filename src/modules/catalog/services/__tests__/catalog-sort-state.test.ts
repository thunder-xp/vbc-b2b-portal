import { describe, expect, it } from "vitest";
import { buildCatalogSortHiddenFields } from "../catalog-sort-state";

const keyA = "property_11111111-1111-4111-8111-111111111111";
const keyB = "property_22222222-2222-4222-8222-222222222222";

describe("buildCatalogSortHiddenFields", () => {
  it("preserves category, search, and one attribute while omitting page", () => {
    expect(buildCatalogSortHiddenFields({ categoryId: " cameras ", search: " dome ", attributeFilters: { [keyA]: ["4 MP"] } })).toEqual([
      { name: "category", value: "cameras" }, { name: "search", value: "dome" }, { name: `attr.${keyA}`, value: "4 MP" },
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
});

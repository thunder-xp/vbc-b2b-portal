import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve("app/(partner)/cabinet/repeat-purchase/page.tsx"), "utf8");

describe("Repeat Purchase top-category contract", () => {
  it("uses the shared governed root-category resolver and filter bar", () => {
    expect(page).toContain("resolveCatalogQuickLinks(data.categories, locale)");
    expect(page).toContain("PartnerTopCategoryFilterBar");
    expect(page).not.toContain("RepeatPurchaseCategoryFilters");
  });

  it("keeps one header count and exposes the canonical Catalog action beside search", () => {
    expect(page.match(/data-repeat-purchase-total/g)).toHaveLength(1);
    expect(page).toContain('href="/cabinet/catalog"');
    expect(page).toContain("copy.wholeCatalog");
  });

  it("does not derive technical leaf facets in React", () => {
    for (const technicalValue of ["04 CH", "08 CH", "2-3 MPX", "4-5 MPX"]) {
      expect(page).not.toContain(technicalValue);
    }
  });
});

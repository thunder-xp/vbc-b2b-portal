import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CatalogSortControl } from "../CatalogSortControl";

describe("B2B catalog toolbar ergonomics", () => {
  it("keeps the primary controls in Categories, Search, Sort, View order", () => {
    const page = source("app/(partner)/cabinet/catalog/page.tsx");
    const toolbar = page.slice(
      page.indexOf("<CatalogToolbarFrame>"),
      page.indexOf("</CatalogToolbarFrame>"),
    );

    expect(toolbar.indexOf("<CategoryMegaMenu")).toBeLessThan(toolbar.indexOf("<CatalogSearch"));
    expect(toolbar.indexOf("<CatalogSearch")).toBeLessThan(toolbar.indexOf("<CatalogSortControl"));
    expect(toolbar.indexOf("<CatalogSortControl")).toBeLessThan(toolbar.indexOf("<CatalogModeLink"));
  });

  it("removes the detached sorting form and duplicate generic count from results", () => {
    const results = source("app/(partner)/cabinet/catalog/CatalogResults.tsx");

    expect(results).not.toContain('name="sort"');
    expect(results).not.toContain("buildCatalogSortHiddenFields");
    expect(results).not.toContain("countLabel={`${copy.found}");
  });

  it("preserves canonical catalog state in the toolbar sort form", () => {
    render(
      <CatalogSortControl
        hiddenFields={[
          { name: "category", value: "cameras" },
          { name: "search", value: "DH-C4K-P" },
          { name: "view", value: "all" },
          { name: "availability", value: "in_stock" },
          { name: "attr.property_11111111-1111-4111-8111-111111111111", value: "4 MP" },
        ]}
        sort="price_desc"
      />,
    );

    expect(screen.getByRole("combobox", { name: "Сортировка" })).toHaveValue("price_desc");
    expect(screen.getByRole("button", { name: "Применить" })).toHaveAttribute("type", "submit");
    expect(document.querySelector('input[name="category"]')).toHaveValue("cameras");
    expect(document.querySelector('input[name="search"]')).toHaveValue("DH-C4K-P");
    expect(document.querySelector('input[name="view"]')).toHaveValue("all");
    expect(document.querySelector('input[name="availability"]')).toHaveValue("in_stock");
    expect(document.querySelector('input[name^="attr."]')).toHaveValue("4 MP");
  });

  it("uses bounded responsive controls without horizontal-width assumptions", () => {
    const toolbar = source("src/modules/catalog/components/CatalogPresentationPrimitives.tsx");
    const sort = source("src/modules/catalog/components/CatalogSortControl.tsx");

    expect(toolbar).toContain("grid-cols-1");
    expect(toolbar).toContain("minmax(0,1fr)");
    expect(sort).toContain("w-full min-w-0");
    expect(sort).not.toContain("min-w-[");
  });
});

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

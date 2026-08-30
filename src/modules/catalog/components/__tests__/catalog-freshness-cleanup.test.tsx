import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CatalogBreadcrumb } from "../CatalogBreadcrumb";
import { ProductAvailabilityBlock } from "../ProductAvailabilityBlock";
import { ProductPricingBlock } from "../ProductPricingBlock";

const catalogResults = source("app/(partner)/cabinet/catalog/CatalogResults.tsx");
const catalogPage = source("app/(partner)/cabinet/catalog/page.tsx");
const adminRatePanel = source("src/modules/pricing-inventory/components/CommercialRateAdminPanel.tsx");

describe("catalog freshness messaging cleanup", () => {
  it("omits the generic freshness banner without changing catalog products or counts", () => {
    expect(catalogResults).not.toContain("staleWarning");
    expect(catalogResults).not.toContain("evaluateFreshness");
    expect(catalogResults).toContain("productsResult.data.products");
    expect(catalogResults).toContain("productsResult.data.totalCount");
    expect(catalogResults).not.toContain("copy.equipmentCatalog");
    expect(readFileSync(join(process.cwd(), "src/modules/partner-locale/catalog-copy.ts"), "utf8"))
      .toContain('equipmentCatalog: "Каталог оборудования"');
  });

  it("omits a root-only breadcrumb but retains useful category navigation", () => {
    const categories = [{ id: "cameras", parentId: null, name: "Камеры", slug: "cameras", description: null }];
    const { rerender } = render(<CatalogBreadcrumb categories={categories} />);
    expect(screen.queryByRole("navigation", { name: "Хлебные крошки" })).not.toBeInTheDocument();

    rerender(<CatalogBreadcrumb categories={categories} selectedId="cameras" />);
    expect(screen.getByRole("navigation", { name: "Хлебные крошки" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Весь каталог" })).toHaveAttribute("href", "/cabinet/catalog");
    expect(screen.getByRole("link", { name: "Камеры" })).toBeInTheDocument();
  });

  it("keeps concrete product-level missing price and unknown stock states", () => {
    render(<><ProductPricingBlock showPartnerPrice showRetailPrice /><ProductAvailabilityBlock /></>);
    expect(screen.getAllByText("Цена уточняется")).toHaveLength(2);
    expect(screen.getByText("Наличие уточняется")).toBeInTheDocument();
  });

  it("keeps internal freshness diagnostics and leaves no catalog spacer replacement", () => {
    expect(adminRatePanel).toContain("Свежесть");
    expect(adminRatePanel).toContain("staleNotice");
    expect(catalogResults).not.toMatch(/staleWarning[^\n]*\?\s*<p/);
    expect(catalogPage).toContain("CategoryMegaMenu");
    expect(catalogPage).toContain("CatalogSearch");
  });
});

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

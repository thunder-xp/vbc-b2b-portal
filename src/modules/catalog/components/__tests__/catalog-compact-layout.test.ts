import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const grid = source("src/modules/catalog/components/ProductGrid.tsx");
const card = source("src/modules/catalog/components/ProductCard.tsx");
const cardFrame = source("src/modules/catalog/components/CatalogProductCardFrame.tsx");
const presentation = source("src/modules/catalog/components/CatalogPresentationPrimitives.tsx");
const results = source("app/(partner)/cabinet/catalog/CatalogResults.tsx");
const merchandising = source("src/modules/catalog/components/CatalogMerchandisingSections.tsx");
const badges = source("src/modules/catalog/components/MerchandisingBadges.tsx");

describe("compact catalog layout", () => {
  it("uses responsive one through five column tracks", () => {
    expect(grid).toContain("CATALOG_PRODUCT_GRID_CLASS");
    expect(presentation).toContain("grid-cols-1");
    expect(presentation).toContain("sm:grid-cols-2");
    expect(presentation).toContain("lg:grid-cols-2");
    expect(presentation).toContain("xl:grid-cols-4");
    expect(presentation).toContain("2xl:grid-cols-5");
  });

  it("reuses the canonical grid and card for bounded merchandising sections", () => {
    expect(merchandising).toContain("CATALOG_PRODUCT_GRID_CLASS");
    expect(merchandising).toContain("<ProductCard");
    expect(merchandising).toContain("slice(0, section.maxProducts ?? 10)");
    expect(merchandising).not.toContain("grid-cols-4");
  });

  it("keeps compact identity, pricing, stock, quantity, and optimized imagery", () => {
    expect(card).toContain("line-clamp-2");
    expect(card).toContain("ProductPricingBlock");
    expect(card).toContain("CatalogQuantityCartAction");
    expect(card).toContain("20vw");
    expect(card).toContain("CatalogCardImage");
    expect(card).toContain('className="truncate');
    expect(card).toContain("line-clamp-2 h-10");
    expect(cardFrame).toContain('compact ? "h-12" : "h-[5.25rem]"');
    expect(cardFrame).toContain('compact ? "h-8" : "h-[3.25rem]"');
    expect(card).toContain("MerchandisingBadgeOverlay");
    expect(badges).toContain("absolute left-2 top-2");
    expect(card).not.toContain("min-h-8 items-center px-3 pt-2");
  });

  it("removes generic catalog freshness messaging", () => {
    expect(results).not.toContain("stockFreshness.label");
    expect(results).not.toContain("priceFreshness.label");
    expect(results).not.toContain("staleWarning");
    expect(results).not.toContain("evaluateFreshness");
    expect(results).not.toContain("Данные давно не обновлялись");
  });
});

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const grid = source("src/modules/catalog/components/ProductGrid.tsx");
const card = source("src/modules/catalog/components/ProductCard.tsx");
const results = source("app/(partner)/cabinet/catalog/CatalogResults.tsx");

describe("compact catalog layout", () => {
  it("uses responsive one through five column tracks", () => {
    expect(grid).toContain("grid-cols-1");
    expect(grid).toContain("sm:grid-cols-2");
    expect(grid).toContain("lg:grid-cols-3");
    expect(grid).toContain("xl:grid-cols-4");
    expect(grid).toContain("2xl:grid-cols-5");
  });

  it("keeps compact identity, pricing, stock, quantity, and optimized imagery", () => {
    expect(card).toContain("line-clamp-2");
    expect(card).toContain("ProductPricingBlock");
    expect(card).toContain("CatalogQuantityCartAction");
    expect(card).toContain("20vw");
    expect(card).toContain("CatalogCardImage");
  });

  it("removes routine freshness labels but retains stale warnings", () => {
    expect(results).not.toContain("stockFreshness.label");
    expect(results).not.toContain("priceFreshness.label");
    expect(results).toContain("staleWarning");
    expect(results).toContain("text-amber-800");
  });
});

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

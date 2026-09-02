import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const presentation = source("src/modules/catalog/components/CatalogPresentation.tsx");
const viewModeShell = source("src/modules/catalog/components/CatalogViewModeShell.tsx");
const favoriteButton = source("src/modules/purchasing-lists/components/FavoriteProductButton.tsx");

describe("catalog favorites performance boundaries", () => {
  it("loads one bounded membership projection for the visible product set", () => {
    expect(presentation.match(/listFavoriteProductIdsAction/g)).toHaveLength(2);
    expect(presentation).toContain("products.map((product) => product.id)");
    expect(presentation).not.toContain("products.map(async");
  });

  it("switches layout with local state and no catalog reload", () => {
    expect(presentation).not.toContain('"use client"');
    expect(viewModeShell).toContain("useState(initialMode)");
    expect(viewModeShell).not.toContain("router.refresh");
    expect(viewModeShell).not.toContain("listCatalogProductsAction");
    expect(viewModeShell).not.toContain("CatalogProductCardDto");
  });

  it("uses a narrow optimistic mutation without global invalidation or ERP calls", () => {
    expect(favoriteButton).toContain("setFavoriteProductAction(productId, next)");
    expect(favoriteButton).not.toContain("router.refresh");
    expect(favoriteButton).not.toMatch(/one.?c|1C|fetch\(/i);
  });

  it("lazy-loads the secondary list chooser", () => {
    expect(favoriteButton).toContain("dynamic(");
    expect(favoriteButton).toContain("PurchasingListChooserDialog");
    expect(favoriteButton).toContain("ssr: false");
    expect(favoriteButton).toContain("withListChooser");
  });
});

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

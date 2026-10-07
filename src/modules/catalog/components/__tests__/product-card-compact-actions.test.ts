import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(path), "utf8");

describe("B2B product-card compact action contract", () => {
  it("keeps Favorite and Compare in the image overlay and excludes duplicate card actions", () => {
    const card = read("src/modules/catalog/components/ProductCard.tsx");

    expect(card).toContain("data-product-card-image-actions");
    expect(card).toContain("absolute right-2 top-2 z-20 flex flex-col");
    expect(card).toContain("reserveImageActions={Boolean(imageActions)}");
    expect(card).toContain("<FavoriteProductButton compact");
    expect(card).toContain("<ProductComparisonAction");
    expect(card).not.toContain("ProductSpecificationAction");
    expect(card).not.toContain("withListChooser");
    expect(card).not.toContain("secondaryActions=");
  });

  it("uses the same governed 44px height for quantity and primary selection action", () => {
    const action = read("src/modules/catalog/components/CatalogQuantityCartAction.tsx");

    expect(action).toContain('className="h-11 min-h-11 w-full');
    expect(action).toContain("data-product-card-quantity");
    expect(action).toContain("style={{ height: 44, minHeight: 44 }}");
    expect(action).toContain("h-11 min-h-11 min-w-0");
    expect(action).toContain("data-product-card-primary-action");
    expect(action).toContain("getQuickSelectionLabel(locale)");
  });

  it("retains the underlying estimate and purchasing-list implementations outside the card", () => {
    expect(read("src/modules/catalog/components/ProductSpecificationAction.tsx")).toContain("addCatalogProductToEstimateAction");
    expect(read("src/modules/purchasing-lists/components/PurchasingListChooserDialog.tsx")).toContain("productId");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync("src/modules/catalog/components/MobileQuickProductCommerce.tsx", "utf8");
const route = readFileSync("app/api/catalog/quick-search/route.ts", "utf8");

describe("mobile quick product geometry and boundaries", () => {
  it("keeps search, selection, quantity, and add controls at least 44px high", () => {
    expect(component).toContain("h-12 w-full");
    expect(component).toContain("h-12 w-12");
    expect(component.match(/h-11/g)?.length).toBeGreaterThanOrEqual(4);
    expect(component).toContain("grid-cols-[8.75rem_minmax(0,1fr)]");
  });

  it("uses bounded server catalog results and local working-selection state without browser database access", () => {
    expect(route).toContain("listCatalogProductsAction");
    expect(route).toContain("const RESULT_LIMIT = 8");
    expect(component).toContain("emitLiveCommerceSelectionAdd");
    expect(component).not.toContain("addToCartAction");
    expect(component).not.toContain("createClient(");
    expect(component).not.toContain("supabase");
    expect(component).not.toMatch(/barcode|BarcodeDetector|EAN|UPC|OCR/);
  });
});

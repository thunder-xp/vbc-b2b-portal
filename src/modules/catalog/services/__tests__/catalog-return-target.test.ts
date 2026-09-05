import { describe, expect, it } from "vitest";

import {
  buildCatalogProductHref,
  buildProductDetailTabHref,
  parseCatalogReturnTarget,
} from "../catalog-return-target";

describe("catalog return target", () => {
  const exactState = "/cabinet/catalog?category=cameras&search=ipc&availability=in_stock&sort=price_desc&page=3&attr.property_11111111-1111-4111-8111-111111111111=4MP";

  it("preserves an exact internal catalog state across product and tab links", () => {
    const productUrl = new URL(buildCatalogProductHref("camera", exactState), "https://www.nsd.md");
    expect(productUrl.searchParams.get("returnTo")).toBe(exactState);

    const tabUrl = new URL(buildProductDetailTabHref("pricing", exactState), "https://www.nsd.md/cabinet/catalog/camera");
    expect(tabUrl.searchParams.get("tab")).toBe("pricing");
    expect(tabUrl.searchParams.get("returnTo")).toBe(exactState);
  });

  it("preserves the live commerce workspace across product and tab links", () => {
    const productUrl = new URL(buildCatalogProductHref("camera", "/cabinet/quick-order"), "https://www.nsd.md");
    expect(productUrl.searchParams.get("returnTo")).toBe("/cabinet/quick-order");

    const tabUrl = new URL(buildProductDetailTabHref("overview", "/cabinet/quick-order"), "https://www.nsd.md/cabinet/catalog/camera");
    expect(tabUrl.searchParams.get("returnTo")).toBe("/cabinet/quick-order");
  });

  it.each([
    "https://attacker.example/cabinet/catalog",
    "//attacker.example/cabinet/catalog",
    "/cabinet/catalog/product",
    "/cabinet/catalog#fragment",
    "/cabinet/quick-order?unexpected=true",
    "/cabinet/quick-order/product",
    "/cabinet\\catalog",
  ])("rejects unsafe or non-catalog target %s", (target) => {
    expect(parseCatalogReturnTarget(target)).toBe("/cabinet/catalog");
  });

  it("uses the catalog root for direct product entry", () => {
    expect(parseCatalogReturnTarget(undefined)).toBe("/cabinet/catalog");
  });
});

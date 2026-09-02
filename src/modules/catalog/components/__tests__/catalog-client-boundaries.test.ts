import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const productCard = source("ProductCard.tsx");
const productImage = source("CatalogCardImage.tsx");
const filterLink = source("CatalogFilterLink.tsx");
const filterShell = source("CatalogFilterShell.tsx");
const technicalFacets = source("CatalogTechnicalFacetGroups.tsx");
const cartAction = readFileSync(
  join(process.cwd(), "src/modules/orders/components/AddToCartButton.tsx"),
  "utf8",
);

describe("catalog client boundaries", () => {
  it("keeps product content and card image projection server rendered", () => {
    expect(productCard).not.toContain('"use client"');
    expect(productImage).not.toContain('"use client"');
    expect(productImage).toContain("ProductThumbnail");
  });

  it("passes only primitive identity into the cart action island", () => {
    expect(productCard).toContain("<CatalogQuantityCartAction productId={product.id}");
    expect(cartAction).toContain("{ productId, showQuantityLabel = true }: { productId: string;");
    expect(cartAction).not.toContain("CatalogProduct");
    expect(cartAction).not.toContain("ProductCommercial");
  });

  it("does not import estimate, PDF, SMTP, or order workflow UI into product cards", () => {
    expect(productCard).not.toMatch(/estimate|pdf|smtp|OrderForm|Checkout/i);
    expect(productCard).toContain('purchasing-lists/components/FavoriteProductButton');
    expect(productCard).toContain("ProductSpecificationAction");
    expect(productCard).toContain("ProductComparisonAction");
    expect(productCard).not.toContain("AddToPurchasingListButton");
  });

  it("keeps catalog filter content outside client transport boundaries", () => {
    expect(filterLink).not.toContain('"use client"');
    expect(filterShell).not.toContain('"use client"');
    expect(filterShell).toContain("{children}");
    expect(filterShell).toContain("CatalogFilterToggle");
    expect(technicalFacets).toContain("CatalogTechnicalFacetGroupsClient");
    expect(technicalFacets).toContain("href: hrefForSelection(next)");
  });
});

function source(file: string) {
  return readFileSync(join(process.cwd(), "src/modules/catalog/components", file), "utf8");
}

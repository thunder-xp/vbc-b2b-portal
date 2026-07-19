import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const productCard = source("ProductCard.tsx");
const productImage = source("CatalogCardImage.tsx");
const cartAction = readFileSync(
  join(process.cwd(), "src/modules/orders/components/AddToCartButton.tsx"),
  "utf8",
);

describe("catalog client boundaries", () => {
  it("keeps product content and images server rendered", () => {
    expect(productCard).not.toContain('"use client"');
    expect(productImage).not.toContain('"use client"');
    expect(productImage).not.toContain('from "next/image"');
  });

  it("passes only primitive identity into the cart action island", () => {
    expect(productCard).toContain("<AddToCartButton productId={product.id} />");
    expect(cartAction).toContain("{ productId }: { productId: string }");
    expect(cartAction).not.toContain("CatalogProduct");
    expect(cartAction).not.toContain("ProductCommercial");
  });

  it("does not import estimate, PDF, SMTP, or order workflow UI into product cards", () => {
    expect(productCard).not.toMatch(/estimate|pdf|smtp|OrderForm|Checkout/i);
  });
});

function source(file: string) {
  return readFileSync(join(process.cwd(), "src/modules/catalog/components", file), "utf8");
}

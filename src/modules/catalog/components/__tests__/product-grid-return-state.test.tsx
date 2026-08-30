import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RESTRICTED_PRODUCT_CARD_CAPABILITIES } from "../product-card.model";
import { ProductGrid } from "../ProductGrid";

vi.mock("../ProductCard", () => ({
  ProductCard: ({ detailHref, product }: { detailHref: string; product: { name: string } }) => (
    <a href={detailHref}>{product.name}</a>
  ),
}));

describe("B2B catalog card return state", () => {
  it("carries the same exact URL-backed state as list mode", () => {
    render(
      <ProductGrid
        capabilities={RESTRICTED_PRODUCT_CARD_CAPABILITIES}
        catalogState={{
          attributeFilters: { "property_11111111-1111-4111-8111-111111111111": ["4 MP"] },
          availability: "expected",
          categoryId: "camera-category",
          explicitAll: true,
          page: 4,
          search: "camera",
          sort: "price_asc",
        }}
        companyId="company-1"
        products={[{
          id: "product-1",
          sku: "400540",
          name: "Camera",
          slug: "camera",
          shortDescription: null,
          imageUrl: null,
          brand: null,
          category: null,
          keyCharacteristics: [],
          datasheet: null,
        }]}
        userId="user-1"
      />,
    );

    const detailUrl = new URL(screen.getByRole("link", { name: "Camera" }).getAttribute("href")!, "https://www.nsd.md");
    const returnUrl = new URL(detailUrl.searchParams.get("returnTo")!, "https://www.nsd.md");
    expect(returnUrl.searchParams.get("category")).toBe("camera-category");
    expect(returnUrl.searchParams.get("availability")).toBe("expected");
    expect(returnUrl.searchParams.get("page")).toBe("4");
    expect(returnUrl.searchParams.get("sort")).toBe("price_asc");
    expect(returnUrl.searchParams.get("attr.property_11111111-1111-4111-8111-111111111111")).toBe("4 MP");
  });
});

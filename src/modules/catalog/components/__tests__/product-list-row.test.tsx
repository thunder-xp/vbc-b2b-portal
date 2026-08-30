import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RESTRICTED_PRODUCT_CARD_CAPABILITIES } from "../product-card.model";
import { ProductList } from "../ProductList";
import type { CatalogProductCardDto } from "../../services";

vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("../CatalogCardImage", () => ({ CatalogCardImage: ({ alt }: { alt: string }) => <span>{alt}</span> }));
vi.mock("../CatalogQuantityCartAction", () => ({ CatalogQuantityCartAction: () => <div data-testid="quantity-cart"><input aria-label="Quantity" /><button type="button">Add to cart</button></div> }));
vi.mock("../../../purchasing-lists/components/FavoriteProductButton", () => ({ FavoriteProductButton: () => <button type="button">Favorite</button> }));
vi.mock("../ProductSpecificationAction", () => ({ ProductSpecificationAction: () => <button type="button">Estimate</button> }));
vi.mock("../ProductComparisonAction", () => ({ ProductComparisonAction: () => <button type="button">Compare</button> }));

const filterKey = "property_11111111-1111-4111-8111-111111111111";
const existingFilterKey = "property_22222222-2222-4222-8222-222222222222";
const catalogState = {
  attributeFilters: { [existingFilterKey]: ["IP65"] },
  availability: "in_stock" as const,
  categoryId: "category-1",
  explicitAll: true,
  search: "camera",
  sort: "price_desc" as const,
};
const product: CatalogProductCardDto = {
  id: "product-1",
  sku: "400540",
  name: "Camera",
  slug: "camera",
  shortDescription: null,
  imageUrl: null,
  brand: null,
  category: { id: "category-1", parentId: null, name: "Cameras", slug: "cameras", description: null },
  keyCharacteristics: [
    { key: filterKey, label: "MicroSD", value: "256 GB", filterValue: "256 GB", isFilterable: true },
    { key: "legacy", label: "Unsupported", value: "Hidden", isFilterable: true },
    { label: "Not filterable", value: "Hidden", isFilterable: false },
  ],
  datasheet: null,
  merchandisingLabels: ["TOP", "NEW"],
};
const capabilities = {
  ...RESTRICTED_PRODUCT_CARD_CAPABILITIES,
  canAddToOrder: true,
  canAddToSpecification: true,
  canManagePurchasingLists: true,
};

describe("B2B catalog list row", () => {
  it("renders accessible icon-only merchandising badges", () => {
    const { container } = renderList();

    for (const label of ["Популярное", "Новинки"]) {
      const badge = screen.getByLabelText(label);
      expect(badge.querySelector("svg")).toBeInTheDocument();
      expect(screen.getByText(label)).toHaveClass("sr-only");
    }
    expect(container.querySelectorAll('[data-testid="catalog-list-characteristics"]')).toHaveLength(1);
  });

  it("links only governed characteristics through the existing URL-backed filter state", () => {
    renderList();

    const chip = screen.getByRole("link", { name: "MicroSD: 256 GB" });
    const url = new URL(chip.getAttribute("href")!, "https://www.nsd.md");
    expect(url.pathname).toBe("/cabinet/catalog");
    expect(url.searchParams.get("category")).toBe("category-1");
    expect(url.searchParams.get("search")).toBe("camera");
    expect(url.searchParams.get("view")).toBe("all");
    expect(url.searchParams.get("sort")).toBe("price_desc");
    expect(url.searchParams.get("availability")).toBe("in_stock");
    expect(url.searchParams.get(`attr.${existingFilterKey}`)).toBe("IP65");
    expect(url.searchParams.get(`attr.${filterKey}`)).toBe("256 GB");
    expect(screen.queryByRole("link", { name: /Unsupported|Not filterable/ })).not.toBeInTheDocument();
  });

  it("keeps cart and secondary controls in one top-aligned action group", () => {
    renderList();

    const actions = screen.getByTestId("catalog-list-actions");
    expect(actions).toHaveClass("items-start", "flex-wrap");
    expect(actions).toContainElement(screen.getByTestId("quantity-cart"));
    for (const label of ["Favorite", "Estimate", "Compare"]) {
      expect(actions).toContainElement(screen.getByRole("button", { name: label }));
    }
  });

  it("omits empty badges and unsupported characteristic placeholders", () => {
    renderList({ ...product, keyCharacteristics: [], merchandisingLabels: [] });
    expect(screen.queryByTestId("catalog-list-characteristics")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Популярное")).not.toBeInTheDocument();
  });
});

function renderList(productOverride: CatalogProductCardDto = product) {
  return render(<ProductList capabilities={capabilities} catalogState={catalogState} companyId="company-1" products={[productOverride]} userId="user-1" />);
}

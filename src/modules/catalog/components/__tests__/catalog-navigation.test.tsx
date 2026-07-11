import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CatalogFilters, catalogHref } from "../CatalogFilters";
import { buildCategoryTree, CategoryMegaMenu } from "../CategoryMegaMenu";

const categories = [
  { id: "direction", parentId: null, name: "Видеонаблюдение", slug: "video", description: null },
  { id: "category", parentId: "direction", name: "Камеры", slug: "cameras", description: null },
  { id: "subcategory", parentId: "category", name: "IP-камеры", slug: "ip-cameras", description: null },
];

describe("catalog navigation", () => {
  it("builds a maximum three-level category tree from read-model data", () => {
    const tree = buildCategoryTree(categories);
    expect(tree[0]?.children[0]?.children[0]?.name).toBe("IP-камеры");
  });

  it("supports drill-down selection without a page reload", async () => {
    const user = userEvent.setup();
    render(<CategoryMegaMenu categories={categories} />);
    await user.click(screen.getByRole("button", { name: "Категории" }));
    await user.click(screen.getByRole("button", { name: "Видеонаблюдение" }));
    await user.click(screen.getByRole("button", { name: "Камеры" }));
    expect(screen.getByRole("link", { name: "IP-камеры" })).toHaveAttribute("href", "/cabinet/catalog?category=subcategory");
  });

  it("persists filter state in URLs and renders an active brand", () => {
    expect(catalogHref({ category: "category", brand: "brand-1", search: "camera", sort: "sku_asc" })).toBe("/cabinet/catalog?category=category&brand=brand-1&search=camera&sort=sku_asc");
    render(<CatalogFilters brands={[{ id: "brand-1", name: "Novotech", slug: "novotech", description: null, logoUrl: null }]} categoryId="category" search="camera" selectedBrandId="brand-1" sort="sku_asc" />);
    expect(screen.getByRole("link", { name: /Novotech/ })).toHaveAttribute("href", "/cabinet/catalog?category=category&search=camera&sort=sku_asc");
  });
});

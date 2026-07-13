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
    const productCategory = screen.getByRole("link", { name: "IP-камеры" });
    expect(productCategory).toHaveAttribute("href", "/cabinet/catalog?category=subcategory");
    productCategory.addEventListener("click", (event) => event.preventDefault());
    await user.click(productCategory);
    expect(screen.queryByText("Выберите направление")).not.toBeInTheDocument();
  });

  it("toggles the category menu from its trigger", async () => {
    const user = userEvent.setup();
    render(<CategoryMegaMenu categories={categories} />);
    const trigger = screen.getByRole("button", { name: "Категории" });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the category menu on outside click", async () => {
    const user = userEvent.setup();
    render(<><CategoryMegaMenu categories={categories} /><button type="button">Outside</button></>);
    await user.click(screen.getByRole("button", { name: "Категории" }));
    expect(screen.getByText("Выберите направление")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByText("Выберите направление")).not.toBeInTheDocument();
  });

  it("closes the category menu on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<CategoryMegaMenu categories={categories} />);
    const trigger = screen.getByRole("button", { name: "Категории" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Выберите направление")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("replaces Brand with an availability filter defaulting to All", () => {
    render(<CatalogFilters />);
    expect(screen.queryByText("Бренд")).not.toBeInTheDocument();
    expect(screen.getByText("Наличие")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Все/ })).toHaveAttribute("href", "/cabinet/catalog");
    expect(screen.getByRole("link", { name: /Все/ })).toContainElement(screen.getByLabelText("Выбрано"));
  });

  it("preserves category, search, availability, and attributes in filter links", () => {
    const key = "property_11111111-1111-4111-8111-111111111111";
    render(<CatalogFilters attributeFilters={{ [key]: ["4 MP"] }} availability="expected" categoryId="category" search="camera" sort="sku_asc" />);
    expect(screen.getByRole("link", { name: /В наличии/ })).toHaveAttribute(
      "href",
      `/cabinet/catalog?category=category&search=camera&sort=sku_asc&availability=in_stock&attr.property_11111111-1111-4111-8111-111111111111=4+MP`,
    );
  });

  it("keeps every filter section collapsed and preserves selection after reopening", async () => {
    const user = userEvent.setup();
    render(<CatalogFilters availability="expected" facets={[{ key: "property_11111111-1111-4111-8111-111111111111", label: "Разрешение", values: [{ value: "4 MP", count: 3, selected: true }] }]} />);
    const availabilityGroup = screen.getByText("Наличие").closest("details");
    const attributeGroup = screen.getByText("Разрешение").closest("details");
    expect(availabilityGroup).not.toHaveAttribute("open");
    expect(attributeGroup).not.toHaveAttribute("open");
    await user.click(screen.getByText("Наличие"));
    await user.click(screen.getByText("Наличие"));
    await user.click(screen.getByText("Наличие"));
    expect(screen.getByRole("link", { name: /К поступлению/ })).toContainElement(screen.getByLabelText("Выбрано"));
  });
});

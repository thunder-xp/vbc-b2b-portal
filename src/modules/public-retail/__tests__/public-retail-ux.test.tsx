import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { PublicRetailCatalog } from "../components/PublicRetailCatalog";
import { PublicRetailProductCard } from "../components/PublicRetailProductCard";
import { availabilityCopy, publicRetailVisibleCategories } from "../presentation";
import { retailCopy } from "../presentation";
import type { PublicRetailProductSummaryDto } from "../types";

const product: PublicRetailProductSummaryDto = {
  id: "10000000-0000-4000-8000-000000000001",
  slug: "camera-model-1",
  sku: "CAM-001",
  name: "Камера видеонаблюдения Model 1",
  shortDescription: "Компактная камера",
  image: null,
  brand: { slug: "brand", name: "Brand" },
  category: { slug: "video", name: "Видеонаблюдение" },
  price: { amount: 1299, currency: "MDL", vatPresentation: "not_specified" },
  availability: "unknown",
  highlights: [{ key: "resolution", label: "Разрешение", value: "4 Мп" }],
  calculatorEligible: true,
};

describe("public retail UX", () => {
  it("uses safe localized availability labels without quantities", () => {
    expect(availabilityCopy.ru).toEqual({ in_stock: "В наличии", low_stock: "Заканчивается", available_to_order: "Под заказ", unavailable: "Нет в наличии", unknown: "Наличие уточняется" });
    render(<PublicRetailProductCard locale="ru" product={product} />);
    expect(screen.getByText("Наличие уточняется")).toBeInTheDocument();
    expect(screen.queryByText(/шт\./)).not.toBeInTheDocument();
  });

  it("renders a bounded image fallback with governed cart and detail actions", () => {
    render(<PublicRetailProductCard locale="ru" product={product} />);
    expect(screen.getByText("Изображение отсутствует")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В корзину" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть Камера видеонаблюдения Model 1" })).toHaveAttribute("href", "/products/camera-model-1?lang=ru");
    expect(screen.queryByText(/Купить|Оформить заказ/)).not.toBeInTheDocument();
  });

  it("constrains product media to the card grid track", () => {
    render(<PublicRetailProductCard locale="ru" product={{ ...product, image: { url: "https://www.nsd.md/storage/v1/object/public/public-product-media/product/image.webp", alt: "Camera" } }} />);
    const image = screen.getByRole("img", { name: "Camera" });
    const media = image.closest("a");
    expect(media?.closest("article")).toHaveClass("flex", "h-full", "overflow-hidden");
    expect(media?.closest("article")).not.toHaveClass("rounded-md");
    expect(media).toHaveClass("aspect-[4/3]", "w-full", "min-w-0", "max-w-full", "overflow-hidden");
    expect(image).toHaveClass("size-full", "max-h-full", "max-w-full", "object-contain");
  });

  it("keeps compact identity, commercial state and actions in stable tracks", () => {
    render(<PublicRetailProductCard badge="Популярный" badgeCode="TOP" locale="ru" product={{ ...product, name: "Очень длинное название камеры видеонаблюдения с технической моделью" }} />);
    expect(screen.getByText("Популярный")).toHaveClass("text-emerald-800");
    expect(screen.getByText("Популярный").closest("span.absolute")).toHaveClass("left-2", "top-2");
    expect(screen.getByRole("link", { name: "Очень длинное название камеры видеонаблюдения с технической моделью" })).toHaveClass("line-clamp-2", "h-10");
    expect(screen.getByText("Brand · Артикул CAM-001")).toHaveClass("truncate");
    expect(screen.getByRole("list", { name: "Характеристики" })).toBeInTheDocument();
    expect(screen.getByText("Наличие уточняется")).toHaveClass("min-h-5");
    expect(screen.getByText("1 299 MDL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В корзину" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Открыть Очень длинное название/ })).toHaveClass("size-11");
  });

  it("does not substitute long descriptions when governed highlights are absent", () => {
    render(<PublicRetailProductCard locale="ru" product={{ ...product, highlights: [], shortDescription: "Длинное техническое описание" }} />);
    expect(screen.queryByText("Длинное техническое описание")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("turns bounded public highlights into server-driven facet shortcuts", () => {
    render(<PublicRetailProductCard locale="ru" product={{ ...product, highlights: [
      { key: "one", label: "One", value: "1" },
      { key: "two", label: "Two", value: "2" },
      { key: "three", label: "Three", value: "3" },
    ] }} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "One: 1" })).toHaveAttribute("href", expect.stringContaining("facet_one=1"));
    expect(screen.getByRole("link", { name: "Two: 2" })).toHaveAttribute("href", expect.stringContaining("facet_two=2"));
    expect(screen.queryByRole("link", { name: "Three: 3" })).not.toBeInTheDocument();
    const availability = screen.getByText("Наличие уточняется");
    expect(availability.querySelector("[aria-hidden='true']")).toHaveClass("rounded-full", "bg-current");
  });

  it("renders bounded category filters, search result and pagination", () => {
    render(<PublicRetailCatalog categories={[{ id: "20000000-0000-4000-8000-000000000001", parentId: null, slug: "video", name: "Видеонаблюдение", description: null, productCount: 25 }]} facets={[{ key: "resolution", label: "Разрешение", values: [{ value: "4 Мп", count: 12 }], coverage: 12 }]} locale="ru" products={{ items: [product], totalCount: 25, limit: 24, offset: 0 }} state={{ category: "video", facets: { resolution: ["4 Мп"] }, mode: "price_asc", page: 1 }} />);
    expect(screen.getByRole("heading", { name: "Каталог" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Витрина" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Витрина" })).toHaveAttribute("href", "/catalog?lang=ru");
    expect(screen.getByRole("link", { name: "Популярное" })).toHaveAttribute("href", "/catalog?lang=ru&view=popular");
    expect(screen.getByRole("link", { name: "Новинки" })).toHaveAttribute("href", "/catalog?lang=ru&view=new");
    expect(screen.getByRole("link", { name: "По цене" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link", { name: "Все категории" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /4 Мп/ }).some((link) => link.getAttribute("href")?.includes("facet_resolution=4+%D0%9C%D0%BF"))).toBe(true);
    expect(screen.getAllByRole("button", { name: "Применить" })).toHaveLength(1);
    expect(screen.getByText("1")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Следующая страница" })).toHaveAttribute("href", expect.stringContaining("page=2"));
    expect(screen.getByRole("link", { name: "Следующая страница" })).toHaveAttribute("href", expect.stringContaining("sort=price_asc"));
  });

  it("uses the shared nested category menu and excludes Project Equipment descendants", async () => {
    const user = userEvent.setup();
    const categories = [
      { id: "root", parentId: null, slug: "video", name: "Видеонаблюдение", description: null, productCount: 12 },
      { id: "child", parentId: "root", slug: "cameras", name: "Камеры", description: null, productCount: 8 },
      { id: "leaf", parentId: "child", slug: "ip-cameras", name: "IP-камеры", description: null, productCount: 5 },
      { id: "project", parentId: null, slug: "project", name: "-PROJECT EQUIPMENT-", description: null, productCount: 4 },
      { id: "project-child", parentId: "project", slug: "project-child", name: "Project child", description: null, productCount: 4 },
    ];
    expect(publicRetailVisibleCategories(categories).map((item) => item.id)).toEqual(["root", "child", "leaf"]);
    render(<PublicRetailCatalog categories={categories} facets={[]} locale="ru" products={{ items: [], totalCount: 0, limit: 24, offset: 0 }} state={{ facets: {}, mode: "popular", page: 1 }} />);
    await user.click(screen.getByRole("button", { name: "Категории" }));
    const dialog = screen.getByRole("dialog", { name: "Категории каталога" });
    expect(within(dialog).queryByText("-PROJECT EQUIPMENT-")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Project child")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Видеонаблюдение" }));
    await user.click(within(dialog).getByRole("button", { name: "Камеры" }));
    expect(within(dialog).getByRole("link", { name: "IP-камеры" })).toHaveAttribute("href", "/catalog?lang=ru&category=ip-cameras");
  });

  it("keeps sorting in its own controls region", () => {
    render(<PublicRetailCatalog categories={[]} facets={[]} locale="ru" products={{ items: [], totalCount: 0, limit: 24, offset: 0 }} state={{ facets: {}, mode: "popular", page: 1 }} />);
    expect(screen.getByRole("region", { name: "Управление каталогом" })).toContainElement(screen.getByLabelText("Сортировка"));
    expect(screen.getByRole("banner")).not.toContainElement(screen.getByLabelText("Сортировка"));
  });

  it("localizes the storefront controls in Romanian", () => {
    render(<PublicRetailCatalog categories={[]} facets={[]} locale="ro" products={{ items: [], totalCount: 0, limit: 24, offset: 0 }} state={{ facets: {}, mode: "popular", page: 1 }} />);
    expect(screen.getByRole("heading", { name: "Vitrină" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Populare" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Noutăți" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "După preț" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Toate categoriile" }).length).toBeGreaterThan(0);
  });

  it("keeps the Romanian card CTA short and the detail action accessible", () => {
    render(<PublicRetailProductCard locale="ro" product={product} />);
    expect(screen.getByRole("button", { name: "În coș" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: `Deschide ${product.name}` })).toHaveClass("size-11");
  });

  it("provides localized customer-facing datasheet copy", () => {
    expect(retailCopy.ru).toMatchObject({ documents: "Документы", datasheet: "Datasheet", openDocument: "Открыть" });
    expect(retailCopy.ro).toMatchObject({ documents: "Documente", datasheet: "Fișă tehnică", openDocument: "Deschide" });
  });
});

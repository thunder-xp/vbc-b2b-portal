import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { PublicRetailCatalog } from "../components/PublicRetailCatalog";
import { PublicRetailProductCard } from "../components/PublicRetailProductCard";
import { publicRetailCatalogReturnHref, publicRetailFilterHref, publicRetailMerchandisingHref } from "../catalog-links";
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
  highlights: [{ key: "resolution", label: "Разрешение", value: "4 Мп", filterable: false }],
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
    expect(screen.getByRole("link", { name: "Подробнее о товаре Камера видеонаблюдения Model 1" })).toHaveAttribute("href", "/products/camera-model-1?lang=ru");
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
    expect(screen.getByText("Популярный")).toHaveClass("border-amber-300", "bg-amber-50", "text-amber-900");
    expect(screen.getByText("Популярный").closest("span.absolute")).toHaveClass("left-2", "top-2");
    expect(screen.getByRole("link", { name: "Очень длинное название камеры видеонаблюдения с технической моделью" })).toHaveClass("line-clamp-2", "h-10");
    expect(screen.getByText("Артикул CAM-001")).toHaveClass("truncate");
    expect(screen.queryByText(/Brand ·/)).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Характеристики" })).not.toBeInTheDocument();
    expect(screen.getByText("Наличие уточняется")).toHaveClass("min-h-5");
    expect(screen.getByText("1 299 MDL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В корзину" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Подробнее о товаре Очень длинное название/ })).toHaveClass("size-11");
  });

  it("does not substitute long descriptions when governed highlights are absent", () => {
    render(<PublicRetailProductCard locale="ru" product={{ ...product, highlights: [], shortDescription: "Длинное техническое описание" }} />);
    expect(screen.queryByText("Длинное техническое описание")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("turns bounded public highlights into server-driven facet shortcuts", () => {
    render(<PublicRetailProductCard locale="ru" product={{ ...product, highlights: [
      { key: "property_11111111-1111-1111-1111-111111111111", label: "One", value: "1", filterable: false },
      { key: "property_22222222-2222-2222-2222-222222222222", label: "Two", value: "2", filterable: false },
      { key: "property_33333333-3333-3333-3333-333333333333", label: "Three", value: "3", filterable: false },
    ] }} filterableFacetKeys={new Set([
      "property_11111111-1111-1111-1111-111111111111",
      "property_22222222-2222-2222-2222-222222222222",
      "property_33333333-3333-3333-3333-333333333333",
    ])} showFacetShortcuts />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "One: 1" })).toHaveAttribute("href", expect.stringContaining("attr.property_11111111-1111-1111-1111-111111111111=1"));
    expect(screen.getByRole("link", { name: "Two: 2" })).toHaveAttribute("href", expect.stringContaining("attr.property_22222222-2222-2222-2222-222222222222=2"));
    expect(screen.queryByRole("link", { name: "Three: 3" })).not.toBeInTheDocument();
    const availability = screen.getByText("Наличие уточняется");
    expect(availability.querySelector("[aria-hidden='true']")).toHaveClass("rounded-full", "bg-current");
  });

  it("does not expose a shortcut for a non-governed highlight identity", () => {
    render(<PublicRetailProductCard locale="ru" product={{ ...product, highlights: [
      { key: "free-text-attribute", label: "Legacy", value: "Unmapped", filterable: false },
    ] }} showFacetShortcuts />);
    expect(screen.queryByRole("link", { name: "Legacy: Unmapped" })).not.toBeInTheDocument();
  });

  it("preserves three combined facets in the canonical B2B URL contract", () => {
    const href = publicRetailFilterHref("ru", {
      attributeFilters: {
        "property_11111111-1111-1111-1111-111111111111": ["4 MP"],
        "property_22222222-2222-2222-2222-222222222222": ["256 GB"],
        "property_33333333-3333-3333-3333-333333333333": ["IVS+SMD"],
      },
      category: "video",
      page: 1,
    }, {});
    const query = new URL(href, "https://www.nsd.md").searchParams;

    expect(query.get("category")).toBe("video");
    expect(query.get("attr.property_11111111-1111-1111-1111-111111111111")).toBe("4 MP");
    expect(query.get("attr.property_22222222-2222-2222-2222-222222222222")).toBe("256 GB");
    expect(query.get("attr.property_33333333-3333-3333-3333-333333333333")).toBe("IVS+SMD");
    expect(href).not.toContain("facet_");
  });

  it("renders technical filters, search result and pagination without a duplicate category block", () => {
    render(<PublicRetailCatalog categories={[{ id: "20000000-0000-4000-8000-000000000001", parentId: null, slug: "video", name: "Видеонаблюдение", description: null, productCount: 25 }]} facets={[{ key: "property_11111111-1111-1111-1111-111111111111", label: "Разрешение", values: [{ value: "4 Мп", count: 12 }], coverage: 12 }]} locale="ru" products={{ items: [product], totalCount: 25, limit: 24, offset: 0 }} state={{ category: "video", attributeFilters: { "property_11111111-1111-1111-1111-111111111111": ["4 Мп"] }, sort: "price_asc", page: 1 }} />);
    expect(screen.getByRole("heading", { name: "Каталог" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Витрина" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Витрина" })).toHaveAttribute("href", "/catalog?lang=ru");
    expect(screen.getByRole("link", { name: "Популярное" })).toHaveAttribute("href", expect.stringMatching(/^\/catalog\?lang=ru&view=popular&return=/));
    expect(screen.getByRole("link", { name: "Новинки" })).toHaveAttribute("href", expect.stringMatching(/^\/catalog\?lang=ru&view=new&return=/));
    expect(screen.getByRole("link", { name: "Спецпредложения" })).toHaveAttribute("href", expect.stringMatching(/^\/catalog\?lang=ru&view=special&return=/));
    expect(screen.queryByRole("link", { name: "По цене" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Категория" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Найдено товаров/)).not.toBeInTheDocument();
    const selectedFacet = screen.getByRole("link", { name: /4 Мп/ });
    expect(selectedFacet).not.toHaveAttribute("href", expect.stringContaining("attr.property_11111111-1111-1111-1111-111111111111"));
    expect(selectedFacet.querySelector("[aria-hidden='true']")).toHaveClass("bg-blue-700");
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
      { id: "project", parentId: null, slug: "project-equipment-a7bad0fc", name: "-PROJECT EQUIPMENT-", description: null, productCount: 4 },
      { id: "project-child", parentId: "project", slug: "project-child", name: "Project child", description: null, productCount: 4 },
    ];
    expect(publicRetailVisibleCategories(categories).map((item) => item.id)).toEqual(["root", "child", "leaf"]);
    render(<PublicRetailCatalog categories={categories} facets={[]} locale="ru" products={{ items: [], totalCount: 0, limit: 24, offset: 0 }} state={{ attributeFilters: {}, mode: "popular", page: 1 }} />);
    await user.click(screen.getByRole("button", { name: "Категории" }));
    const dialog = screen.getByRole("dialog", { name: "Категории каталога" });
    expect(within(dialog).queryByText("-PROJECT EQUIPMENT-")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Project child")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Видеонаблюдение" }));
    await user.click(within(dialog).getByRole("button", { name: "Камеры" }));
    expect(within(dialog).getByRole("link", { name: "IP-камеры" })).toHaveAttribute("href", "/catalog?lang=ru&category=ip-cameras");
  });

  it("toggles merchandising back to the exact sanitized plain catalog state", () => {
    const state = {
      q: "camera",
      category: "video",
      availability: "in_stock",
      attributeFilters: { "property_11111111-1111-1111-1111-111111111111": ["4 MP"] },
      sort: "price_asc" as const,
      page: 3,
    };
    const activeHref = publicRetailMerchandisingHref("ru", "popular", state);
    const activeUrl = new URL(activeHref, "https://www.nsd.md");
    const returnHref = activeUrl.searchParams.get("return") ?? undefined;
    expect(returnHref).toContain("q=camera");
    expect(returnHref).toContain("sort=price_asc");
    expect(returnHref).toContain("page=3");
    expect(publicRetailCatalogReturnHref("ru", returnHref)).toBe(returnHref);
    expect(publicRetailMerchandisingHref("ru", "popular", { attributeFilters: {}, mode: "popular", returnHref, page: 1 })).toBe(returnHref);
    expect(publicRetailCatalogReturnHref("ru", "https://evil.example/catalog?lang=ru")).toBeUndefined();
  });

  it("keeps sorting on the catalog results header level", () => {
    render(<PublicRetailCatalog categories={[]} facets={[]} locale="ru" products={{ items: [], totalCount: 0, limit: 24, offset: 0 }} state={{ attributeFilters: {}, page: 1 }} />);
    expect(screen.getByLabelText("Сортировка").closest("header")).toContainElement(screen.getByRole("heading", { level: 1, name: "Каталог" }));
    expect(screen.queryByRole("region", { name: "Управление каталогом" })).not.toBeInTheDocument();
  });

  it("names the full current replenishment collection explicitly", () => {
    render(<PublicRetailCatalog categories={[]} facets={[]} locale="ru" products={{ items: [], totalCount: 0, limit: 24, offset: 0 }} state={{ attributeFilters: {}, mode: "replenishment", page: 1 }} />);
    expect(screen.getByRole("heading", { level: 1, name: "Пополнение" })).toBeInTheDocument();
  });

  it("localizes the storefront controls in Romanian", () => {
    render(<PublicRetailCatalog categories={[]} facets={[]} locale="ro" products={{ items: [], totalCount: 0, limit: 24, offset: 0 }} state={{ attributeFilters: {}, mode: "popular", page: 1 }} />);
    expect(screen.getByRole("heading", { name: "Vitrină" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Populare" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Noutăți" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Oferte speciale" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Categorie" })).not.toBeInTheDocument();
  });

  it("keeps the Romanian card CTA short and the detail action accessible", () => {
    render(<PublicRetailProductCard locale="ro" product={product} />);
    expect(screen.getByRole("button", { name: "În coș" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: `Mai multe detalii despre produsul ${product.name}` })).toHaveClass("size-11");
  });

  it("provides localized customer-facing datasheet copy", () => {
    expect(retailCopy.ru).toMatchObject({ documents: "Документы", datasheet: "Datasheet", openDocument: "Открыть" });
    expect(retailCopy.ro).toMatchObject({ documents: "Documente", datasheet: "Fișă tehnică", openDocument: "Deschide" });
  });
});

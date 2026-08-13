import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { PublicRetailCatalog } from "../components/PublicRetailCatalog";
import { PublicRetailProductCard } from "../components/PublicRetailProductCard";
import { availabilityCopy } from "../presentation";
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
    expect(screen.getByRole("link", { name: "Подробнее" })).toHaveAttribute("href", "/products/camera-model-1?lang=ru");
    expect(screen.queryByText(/Купить|Оформить заказ/)).not.toBeInTheDocument();
  });

  it("constrains product media to the card grid track", () => {
    render(<PublicRetailProductCard locale="ru" product={{ ...product, image: { url: "https://www.nsd.md/storage/v1/object/public/public-product-media/product/image.webp", alt: "Camera" } }} />);
    const image = screen.getByRole("img", { name: "Camera" });
    const media = image.closest("a");
    expect(media?.closest("article")).toHaveClass("grid-cols-[minmax(0,1fr)]", "overflow-hidden");
    expect(media).toHaveClass("h-32", "sm:h-40", "xl:h-44", "w-full", "min-w-0", "max-w-full", "overflow-hidden");
    expect(image).toHaveClass("size-full", "max-h-full", "max-w-full", "object-contain");
  });

  it("keeps identity, highlights, commercial state and actions in stable tracks", () => {
    render(<PublicRetailProductCard badge="Популярный" locale="ru" product={{ ...product, name: "Очень длинное название камеры видеонаблюдения с технической моделью" }} />);
    expect(screen.getByText("Популярный")).toHaveClass("absolute", "left-2", "top-2");
    expect(screen.getByRole("link", { name: "Очень длинное название камеры видеонаблюдения с технической моделью" })).toHaveClass("line-clamp-2", "min-h-10");
    expect(screen.getByRole("list")).toHaveClass("min-h-[3.75rem]");
    expect(screen.getByText("Наличие уточняется")).toHaveClass("min-h-5");
    expect(screen.getByText("1 299 MDL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В корзину" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Подробнее" })).toBeInTheDocument();
  });

  it("does not substitute long descriptions when governed highlights are absent", () => {
    render(<PublicRetailProductCard locale="ru" product={{ ...product, highlights: [], shortDescription: "Длинное техническое описание" }} />);
    expect(screen.queryByText("Длинное техническое описание")).not.toBeInTheDocument();
    expect(screen.getByRole("list")).toBeEmptyDOMElement();
  });

  it("renders bounded category filters, search result and pagination", () => {
    render(<PublicRetailCatalog categories={[{ id: "20000000-0000-4000-8000-000000000001", parentId: null, slug: "video", name: "Видеонаблюдение", description: null, productCount: 25 }]} facets={[{ key: "resolution", label: "Разрешение", values: [{ value: "4 Мп", count: 12 }], coverage: 12 }]} locale="ru" products={{ items: [product], totalCount: 25, limit: 24, offset: 0 }} state={{ category: "video", facets: { resolution: ["4 Мп"] }, mode: "price_asc", page: 1 }} />);
    expect(screen.getByRole("heading", { name: "Каталог" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Витрина" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Популярное" })).toHaveAttribute("href", "/catalog?lang=ru&view=popular");
    expect(screen.getByRole("link", { name: "Новинки" })).toHaveAttribute("href", "/catalog?lang=ru&view=new");
    expect(screen.getByRole("link", { name: "По цене" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByLabelText("Все категории").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("checkbox", { name: /4 Мп/ }).length).toBeGreaterThan(0);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Далее" })).toHaveAttribute("href", expect.stringContaining("page=2"));
    expect(screen.getByRole("link", { name: "Далее" })).toHaveAttribute("href", expect.stringContaining("sort=price_asc"));
  });

  it("localizes the storefront controls in Romanian", () => {
    render(<PublicRetailCatalog categories={[]} facets={[]} locale="ro" products={{ items: [], totalCount: 0, limit: 24, offset: 0 }} state={{ facets: {}, mode: "popular", page: 1 }} />);
    expect(screen.getByRole("heading", { name: "Vitrină" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Populare" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Noutăți" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "După preț" })).toBeInTheDocument();
    expect(screen.getAllByLabelText("Toate categoriile").length).toBeGreaterThan(0);
  });

  it("provides localized customer-facing datasheet copy", () => {
    expect(retailCopy.ru).toMatchObject({ documents: "Документы", datasheet: "Datasheet", openDocument: "Открыть" });
    expect(retailCopy.ro).toMatchObject({ documents: "Documente", datasheet: "Fișă tehnică", openDocument: "Deschide" });
  });
});

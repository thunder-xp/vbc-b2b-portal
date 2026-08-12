import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PublicRetailCatalog } from "../components/PublicRetailCatalog";
import { PublicRetailProductCard } from "../components/PublicRetailProductCard";
import { availabilityCopy } from "../presentation";
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

  it("renders a bounded image fallback and a detail action, never cart commerce", () => {
    render(<PublicRetailProductCard locale="ru" product={product} />);
    expect(screen.getByText("Изображение отсутствует")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Подробнее" })).toHaveAttribute("href", "/products/camera-model-1?lang=ru");
    expect(screen.queryByText(/Купить|В корзину|Оформить заказ/)).not.toBeInTheDocument();
  });

  it("renders bounded category filters, search result and pagination", () => {
    render(<PublicRetailCatalog categories={[{ id: "20000000-0000-4000-8000-000000000001", parentId: null, slug: "video", name: "Видеонаблюдение", description: null, productCount: 25 }]} facets={[{ key: "resolution", label: "Разрешение", values: [{ value: "4 Мп", count: 12 }], coverage: 12 }]} locale="ru" products={{ items: [product], totalCount: 25, limit: 24, offset: 0 }} state={{ category: "video", facets: { resolution: ["4 Мп"] }, page: 1 }} />);
    expect(screen.getByRole("heading", { name: "Каталог" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox", { name: /4 Мп/ }).length).toBeGreaterThan(0);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Далее" })).toHaveAttribute("href", expect.stringContaining("page=2"));
  });
});

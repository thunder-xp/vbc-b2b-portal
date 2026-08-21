import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogComparisonDto } from "../../actions";
import { ProductComparisonView } from "../ProductComparisonView";
import { writeComparisonIds } from "../comparison-storage";

const getComparison = vi.fn();

vi.mock("../../actions", () => ({
  getCatalogComparisonAction: (...args: unknown[]) => getComparison(...args),
}));
vi.mock("../../../behavior-analytics/components/BehaviorViewEvent", () => ({
  recordBehaviorInteraction: vi.fn(),
}));
vi.mock("../../../orders/components/AddToCartButton", () => ({
  AddToCartButton: ({ productId }: { productId: string }) => (
    <button type="button">В корзину {productId}</button>
  ),
}));
vi.mock("../ProductSpecificationAction", () => ({
  ProductSpecificationAction: ({ productId }: { productId: string }) => (
    <button type="button">В смету {productId}</button>
  ),
}));
vi.mock("../ProductThumbnail", () => ({
  ProductThumbnail: ({ alt }: { alt: string }) => <span>{alt} image</span>,
}));
vi.mock("../MerchandisingBadges", () => ({
  MerchandisingBadges: () => null,
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href} {...props}>{children}</a>,
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("ProductComparisonView", () => {
  it("shows an actionable empty state without requiring a category", async () => {
    renderView();

    expect(await screen.findByRole("heading", { name: "Список сравнения пуст" }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть каталог" }))
      .toHaveAttribute("href", "/cabinet/catalog");
    expect(getComparison).not.toHaveBeenCalled();
  });

  it("renders one product with guidance and optional commercial placeholders", async () => {
    writeComparisonIds("company-1", "user-1", ["product-1"]);
    getComparison.mockResolvedValue(success(comparison([product("product-1", "Камера", "category-1")])));

    renderView();

    expect(await screen.findByText("Камера")).toBeInTheDocument();
    expect(screen.getByText("Добавьте ещё один товар, чтобы увидеть различия характеристик."))
      .toBeInTheDocument();
    expect(screen.getByText("Цена уточняется")).toBeInTheDocument();
    expect(screen.getByText("Наличие уточняется")).toBeInTheDocument();
  });

  it("renders mixed-category products and a deterministic difference matrix", async () => {
    writeComparisonIds("company-1", "user-1", ["product-1", "product-2"]);
    getComparison.mockResolvedValue(success({
      ...comparison([
        product("product-1", "Камера", "category-1"),
        product("product-2", "Регистратор", "category-2"),
      ]),
      matrix: [{
        key: "resolution",
        label: "Разрешение",
        values: ["4 Мп", "8 Мп"],
        differs: true,
      }],
      mixedCategories: true,
    }));

    renderView();

    expect(await screen.findByText("Регистратор")).toBeInTheDocument();
    expect(screen.getByText(/Товары относятся к разным категориям/)).toBeInTheDocument();
    expect(screen.getByText("Разрешение")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Выделить отличия" }));
    expect(screen.getByRole("button", { name: "Выделить отличия" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  it("preserves full and retail-only commercial visibility", async () => {
    writeComparisonIds("company-1", "user-1", ["product-1"]);
    getComparison.mockResolvedValueOnce(success({
      ...comparison([product("product-1", "Камера", "category-1")]),
      commercialViews: [commercialView("product-1", true)],
    }));
    const { unmount } = renderView();
    expect(await screen.findByText("Ваша цена")).toBeInTheDocument();
    expect(screen.getByText("Розничная цена")).toBeInTheDocument();
    unmount();

    getComparison.mockResolvedValueOnce(success({
      ...comparison([product("product-1", "Камера", "category-1")]),
      commercialViews: [commercialView("product-1", false)],
    }));
    renderView();
    await screen.findByText("Розничная цена");
    expect(screen.queryByText("Ваша цена")).not.toBeInTheDocument();
  });

  it("removes and clears products idempotently", async () => {
    writeComparisonIds("company-1", "user-1", ["product-1", "product-2"]);
    getComparison.mockResolvedValue(success(comparison([
      product("product-1", "Камера", "category-1"),
      product("product-2", "Регистратор", "category-1"),
    ])));
    renderView();
    await screen.findByText("Регистратор");

    fireEvent.click(screen.getByRole("button", {
      name: "Удалить из сравнения: Камера",
    }));
    await waitFor(() =>
      expect(JSON.parse(
        localStorage.getItem("novotech-catalog-compare:company-1:user-1") ?? "[]",
      )).toEqual(["product-2"]),
    );

    fireEvent.click(screen.getByRole("button", { name: "Очистить" }));
    await waitFor(() =>
      expect(JSON.parse(
        localStorage.getItem("novotech-catalog-compare:company-1:user-1") ?? "[]",
      )).toEqual([]),
    );
  });

  it("shows partial and retry states without exposing technical details", async () => {
    writeComparisonIds("company-1", "user-1", ["product-1"]);
    getComparison.mockResolvedValueOnce(success({
      ...comparison([product("product-1", "Камера", "category-1")]),
      excludedProductCount: 1,
      warnings: ["COMPARISON_ENRICHMENT_FAILED"],
    })).mockResolvedValueOnce({
      success: false,
      errorCode: "COMPARISON_READ_FAILED",
      message: "Не удалось загрузить сравнение. Повторите попытку. Код: safe-id.",
      data: null,
    });
    const { unmount } = renderView();
    expect(await screen.findByText(/Некоторые товары больше недоступны/))
      .toBeInTheDocument();
    expect(screen.getByText(/Часть коммерческих данных временно недоступна/))
      .toBeInTheDocument();
    unmount();

    renderView();
    expect(await screen.findByRole("button", { name: "Повторить" }))
      .toBeInTheDocument();
    expect(screen.queryByText(/safe-id/)).not.toBeInTheDocument();
  });
});

function renderView() {
  return render(
    <ProductComparisonView
      canAddToOrder
      canAddToSpecification
      companyId="company-1"
      userId="user-1"
    />,
  );
}

function product(id: string, name: string, categoryId: string) {
  return {
    id,
    sku: `SKU-${id}`,
    name,
    slug: id,
    shortDescription: null,
    imageUrl: null,
    brand: null,
    category: {
      id: categoryId,
      parentId: null,
      name: categoryId,
      slug: categoryId,
      description: null,
    },
    keyCharacteristics: [],
    datasheet: null,
    merchandisingLabels: [],
  };
}

function comparison(
  products: ReturnType<typeof product>[],
): CatalogComparisonDto {
  return {
    products,
    commercialViews: [],
    matrix: [],
    excludedProductCount: 0,
    warnings: [],
    mixedCategories: false,
  };
}

function success(data: CatalogComparisonDto) {
  return { success: true, errorCode: null, message: "ok", data };
}

function commercialView(productId: string, partnerVisible: boolean) {
  return {
    productId,
    partnerPrice: partnerVisible
      ? { formattedAmount: "100 MDL", amount: 100, currencyCode: "MDL" }
      : null,
    retailPrice: { formattedAmount: "120 MDL", amount: 120, currencyCode: "MDL" },
    stock: null,
  } as CatalogComparisonDto["commercialViews"][number];
}

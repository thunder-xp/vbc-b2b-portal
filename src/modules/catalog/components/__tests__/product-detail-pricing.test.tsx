import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProductDetail } from "../ProductDetail";

vi.mock("../../../orders/components/AddToCartButton", () => ({ AddToCartButton: () => <button type="button">Add</button> }));

vi.mock("next/link", () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("../ProductImageGallery", () => ({ ProductImageGallery: ({ productId }: { productId: string }) => <div>Изображение товара {productId}</div> }));
vi.mock("../../../orders/components", () => ({ AddToCartButton: () => <button type="button">В корзину</button> }));
vi.mock("../ProductActions", () => ({ ProductActions: () => <div><button type="button">В корзину</button><button type="button">В смету</button><button type="button">В сравнение</button><button type="button">В избранное</button></div> }));
vi.mock("../ExpandableDescription", () => ({ ExpandableDescription: ({ text }: { text: string }) => <p className="line-clamp-[9] text-sm leading-[1.5]">{text}</p> }));
vi.mock("../RetailPriceHistoryChart", () => ({ RetailPriceHistoryChart: () => <div>Retail chart</div> }));

describe("ProductDetail information architecture", () => {
  it("keeps identity, cart, commercial summary, and availability in the default overview", () => {
    const { container } = render(<ProductDetail canAddToOrder commercialView={commercialView} product={product} />);

    expect(screen.getByRole("link", { name: "Обзор" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("Camera description")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В корзину" })).toBeInTheDocument();
    expect(screen.getByText("Ваша цена")).toBeInTheDocument();
    expect(screen.getByText("839 MDL")).toBeInTheDocument();
    expect(screen.getByText("$48.95 USD")).toBeInTheDocument();
    expect(screen.getByText("$89.00")).toBeInTheDocument();
    expect(screen.getByText("687 MDL")).toBeInTheDocument();
    expect(screen.getByText("Валовая прибыль")).toBeInTheDocument();
    expect(screen.getByText("Наличие и поступления")).toBeInTheDocument();
    expect(screen.getByText("24 шт.")).toBeInTheDocument();

    const text = container.textContent ?? "";
    expect(text.indexOf("Изображение товара product-1")).toBeLessThan(text.indexOf("IP Camera"));
    expect(screen.queryByText("Коммерческое предложение")).not.toBeInTheDocument();
    expect(text.indexOf("Наличие и поступления")).toBeLessThan(text.indexOf("В корзину"));
    expect(screen.queryByRole("heading", { name: "Ключевые характеристики" })).not.toBeInTheDocument();
  });

  it("keeps the partner USD price visible without fabricating MDL when the published rate is unavailable", () => {
    render(<ProductDetail commercialView={{ ...commercialView, partnerPriceMdl: null, commercialOpportunity: null }} product={product} />);

    expect(screen.getByText("$48.95 USD")).toBeInTheDocument();
    expect(screen.getByText("Цена в MDL временно недоступна")).toBeInTheDocument();
    expect(screen.queryByText("839 MDL")).not.toBeInTheDocument();
  });

  it("keeps source MSRP USD visible when its independent MDL rate is unavailable", () => {
    render(<ProductDetail commercialView={{ ...commercialView, retailPrice: null, commercialOpportunity: null }} product={product} />);
    expect(screen.getAllByText("$89.00")).toHaveLength(2);
    expect(screen.getByText("Цена в MDL временно недоступна")).toBeInTheDocument();
    expect(screen.queryByText("1 526 MDL")).not.toBeInTheDocument();
  });

  it("removes the back link and places tabs above the shared image/content layout", () => {
    render(<ProductDetail product={product} />);
    expect(screen.queryByRole("link", { name: "← Вернуться в каталог" })).not.toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "Разделы товара" });
    const layout = screen.getByTestId("product-detail-layout");
    expect(tabs.compareDocumentPosition(layout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(layout).toHaveClass("md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]");
    expect(screen.getByTestId("product-detail-image").compareDocumentPosition(screen.getByTestId("product-detail-content")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(["description", "characteristics", "datasheet", "pricing"] as const)("uses the shared image/content layout for %s", (activeTab) => {
    render(<ProductDetail activeTab={activeTab} product={product} />);
    expect(screen.getByTestId("product-detail-layout")).toBeInTheDocument();
    expect(screen.getByText("Изображение товара product-1")).toBeInTheDocument();
    expect(screen.queryByText("← Вернуться в каталог")).not.toBeInTheDocument();
  });

  it("does not duplicate the main image on the relations tab", () => {
    render(<ProductDetail activeTab="relations" product={product} relationsContent={<div>Relations</div>} />);
    expect(screen.queryByTestId("product-detail-layout")).not.toBeInTheDocument();
    expect(screen.queryByText("Изображение товара product-1")).not.toBeInTheDocument();
  });

  it("keeps title first and SKU directly below in Overview", () => {
    const { container } = render(<ProductDetail product={product} />);
    const text = container.textContent ?? "";
    expect(text.indexOf("IP Camera")).toBeLessThan(text.indexOf("Артикул: NV-100"));
  });

  it.each([
    ["low_stock", "Товар заканчивается на складе. Доступны аналоги."],
    ["out_of_stock", "Товар временно недоступен. Выберите подходящий аналог."],
    ["expected", "Товар ожидается к поступлению. Для срочной закупки доступны аналоги."],
  ] as const)("shows a compact analog deep link for %s", (status, message) => {
    render(<ProductDetail commercialView={{ ...commercialView, stock: { ...commercialView.stock, status } }} hasAnalogs product={product} />);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Посмотреть аналоги" })).toHaveAttribute("href", "?tab=relations");
    expect(screen.getByTestId("product-relations-prompt")).toBeInTheDocument();
  });

  it("does not show the relation warning for healthy stock or without analogs", () => {
    const { rerender } = render(<ProductDetail commercialView={commercialView} hasAnalogs product={product} />);
    expect(screen.queryByRole("link", { name: "Посмотреть аналоги" })).not.toBeInTheDocument();
    rerender(<ProductDetail commercialView={{ ...commercialView, stock: { ...commercialView.stock, status: "low_stock" } }} product={product} />);
    expect(screen.queryByRole("link", { name: "Посмотреть аналоги" })).not.toBeInTheDocument();
  });

  it("renders relation content only in the active relations tab", () => {
    const relations = <div>Relation card grid</div>;
    const { rerender } = render(<ProductDetail product={product} relationsContent={relations} />);
    expect(screen.queryByText("Relation card grid")).not.toBeInTheDocument();
    rerender(<ProductDetail activeTab="relations" product={product} relationsContent={relations} />);
    expect(screen.getByText("Relation card grid")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Аналоги и сопутствующие" })).toHaveAttribute("aria-current", "page");
  });

  it("shows only long-form copy in Description and has an honest empty state", () => {
    const { rerender } = render(<ProductDetail activeTab="description" product={product} />);
    expect(screen.getByText("Camera description")).toHaveClass("line-clamp-[9]", "text-sm", "leading-[1.5]");
    expect(screen.queryByText("Коммерческое предложение")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "В корзину" })).not.toBeInTheDocument();

    rerender(<ProductDetail activeTab="description" product={{ ...product, description: null }} />);
    expect(screen.getByText("Описание товара пока не добавлено.")).toBeInTheDocument();
  });

  it("shows only technical attributes in Characteristics", () => {
    render(<ProductDetail activeTab="characteristics" commercialView={commercialView} product={product} />);
    expect(screen.getByText("Resolution")).toBeInTheDocument();
    expect(screen.getByText("4 MPX")).toBeInTheDocument();
    expect(screen.queryByText("Партнёрская цена")).not.toBeInTheDocument();
    expect(screen.queryByText("Наличие и поступления")).not.toBeInTheDocument();
    expect(screen.queryByText("Открыть документ")).not.toBeInTheDocument();
    expect(screen.getByTestId("product-detail-content")).toContainElement(screen.getByText("Resolution"));
  });

  it("links only approved filterable characteristics to the structured catalog filter", () => {
    const key = "property_12345678-1234-1234-1234-123456789abc";
    render(<ProductDetail activeTab="characteristics" product={{ ...product, keyCharacteristics: [{ key, label: "Материал", value: "Пластик", isFilterable: true }, { label: "Комментарий", value: "Текст", isFilterable: false }] }} />);
    expect(screen.getByRole("link", { name: "Показать товары: Материал — Пластик" })).toHaveAttribute("href", expect.stringContaining(`attr.${key}=`));
    expect(screen.getByText("Текст").closest("a")).toBeNull();
  });

  it("displays Boolean values in Russian while filtering by the indexed value", () => {
    const key = "property_12345678-1234-1234-1234-123456789abc";
    render(<ProductDetail activeTab="characteristics" product={{ ...product, keyCharacteristics: [{ key, label: "Микрофон", value: "Да", filterValue: "true", isFilterable: true, valueType: "boolean" }] }} />);
    expect(screen.getByRole("link", { name: "Показать товары: Микрофон — Да" })).toHaveAttribute("href", expect.stringContaining("true"));
  });

  it("shows only documents in Datasheet", () => {
    render(<ProductDetail activeTab="datasheet" product={{ ...product, datasheet: datasheetDocument, documents: [datasheetDocument] }} />);
    expect(screen.getByRole("link", { name: "Открыть документ" })).toHaveAttribute("href", "https://example.com/camera.pdf");
    expect(screen.queryByText("Resolution")).not.toBeInTheDocument();
    expect(screen.queryByText("Партнёрская цена")).not.toBeInTheDocument();
    expect(screen.queryByText("Наличие и поступления")).not.toBeInTheDocument();
    expect(screen.getByTestId("product-detail-content")).toContainElement(screen.getByRole("link", { name: "Открыть документ" }));
  });

  it("shows canonical RETAIL baseline without confidential partner pricing", () => {
    render(<ProductDetail activeTab="pricing" commercialView={commercialView} product={product} retailPriceHistory={retailHistory} />);
    expect(screen.getByRole("heading", { name: "История розничной цены" })).toBeInTheDocument();
    expect(screen.getByText("2 399,00 MDL")).toBeInTheDocument();
    expect(screen.getByText("История изменений накапливается. Сейчас доступна только текущая розничная цена.")).toBeInTheDocument();
    expect(screen.queryByText("Партнёрская цена")).not.toBeInTheDocument();
    expect(screen.queryByText("Розничная цена")).not.toBeInTheDocument();
    expect(screen.queryByText("Наличие и поступления")).not.toBeInTheDocument();
    expect(screen.getByTestId("product-detail-content")).toContainElement(screen.getByText("Retail chart"));
  });

  it("renders all six compact tab destinations in the required order", () => {
    render(<ProductDetail product={product} />);
    const tabs = screen.getByRole("navigation", { name: "Разделы товара" });
    expect(tabs.textContent).toMatch(/^ОбзорОписаниеХарактеристикиИнструкцииЦенообразованиеАналоги и сопутствующие$/);
    expect(screen.getByRole("link", { name: "Обзор" })).toHaveAttribute("href", "?tab=overview");
    expect(screen.getByRole("link", { name: "Описание" })).toHaveAttribute("href", "?tab=description");
    expect(screen.getByRole("link", { name: "Характеристики" })).toHaveAttribute("href", "?tab=characteristics");
    expect(screen.getByRole("link", { name: "Инструкции" })).toHaveAttribute("href", "?tab=datasheet");
    expect(screen.getByRole("link", { name: "Ценообразование" })).toHaveAttribute("href", "?tab=pricing");
    expect(screen.getByRole("link", { name: "Аналоги и сопутствующие" })).toHaveAttribute("href", "?tab=relations");
  });
});

const product = { id: "product-1", sku: "NV-100", name: "IP Camera", slug: "ip-camera", shortDescription: null, description: "Camera description", imageUrl: null, brand: { id: "brand-1", name: "Dahua", slug: "dahua", description: null, logoUrl: null, sortOrder: 0, isActive: true }, category: null, keyCharacteristics: [{ label: "Resolution", value: "4 MPX" }], datasheet: null, images: [], documents: [] };
const datasheetDocument = { id: "datasheet-1", title: "Datasheet", documentType: "datasheet", url: "https://example.com/camera.pdf" };
const commercialView = { productId: "product-1", partnerPrice: { currencyCode: "USD", amount: 48.95, formattedAmount: "$48.95", lastUpdatedAt: "2026-07-15T02:00:00Z" }, partnerPriceMdl: { currencyCode: "MDL", amount: 839, formattedAmount: "839 MDL", lastUpdatedAt: "2026-07-15T02:00:00Z" }, msrpPriceUsd: { currencyCode: "USD", amount: 89, formattedAmount: "$89.00", lastUpdatedAt: "2026-07-15T02:00:00Z" }, retailPrice: { currencyCode: "MDL", amount: 1526, formattedAmount: "1 526 MDL", lastUpdatedAt: "2026-07-15T02:00:00Z" }, commercialOpportunity: { reversePartnerUsd: 48.95, reverseRetailUsd: 89, grossProfitUsd: 40.05, grossProfitMdl: 687, markupPercent: 81.82, formattedGrossProfit: "$40.05", formattedGrossProfitMdl: "687 MDL", formattedMarkup: "81.82%" }, stock: { status: "in_stock" as const, label: "В наличии: 8 шт.", exactAvailableQuantity: 8, exactPhysicalQuantity: 10, exactReservedQuantity: 2, exactIncomingQuantity: 91, expectedArrival: { expectedQuantity: 24, expectedDate: "2026-07-28", formattedExpectedDate: "28 июля 2026 г.", sourceStatus: "confirmed_supply" as const }, hasVariantStock: false, lastUpdatedAt: "2026-07-15T02:00:00Z" }, isDemoData: false };
const retailHistory = { current: { amount: 2399, currency: "MDL", effectiveAt: "2026-07-12T00:00:00Z" }, points: [{ amount: 2399, currency: "MDL", effectiveAt: "2026-07-12T00:00:00Z", source: "initial_baseline" as const }], firstAt: "2026-07-12T00:00:00Z", lastAt: "2026-07-12T00:00:00Z", previousAmount: null, minimumAmount: 2399, maximumAmount: 2399, mode: "baseline_only" as const, range: "12m" as const, truncated: false, formattedCurrent: "2 399,00 MDL", formattedPrevious: null, formattedMinimum: "2 399,00 MDL", formattedMaximum: "2 399,00 MDL", formattedAbsoluteChange: null, formattedPercentageChange: null };

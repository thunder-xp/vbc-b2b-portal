import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProductDetail } from "../ProductDetail";

vi.mock("next/link", () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("../ProductImageGallery", () => ({ ProductImageGallery: () => <div>Изображение товара</div> }));
vi.mock("../../../orders/components", () => ({ AddToCartButton: () => <button type="button">В корзину</button> }));
vi.mock("../ProductActions", () => ({ ProductActions: () => <div><button type="button">В корзину</button><button type="button">В смету</button><button type="button">В сравнение</button><button type="button">В избранное</button></div> }));
vi.mock("../ExpandableDescription", () => ({ ExpandableDescription: ({ text }: { text: string }) => <p className="line-clamp-[13]">{text}</p> }));

describe("ProductDetail information architecture", () => {
  it("keeps identity, description, cart, commercial summary, and availability in the default tab", () => {
    const { container } = render(<ProductDetail canAddToOrder commercialView={commercialView} product={product} />);

    expect(screen.getByRole("link", { name: "Описание" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Camera description")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В корзину" })).toBeInTheDocument();
    expect(screen.getByText("Партнёрская цена")).toBeInTheDocument();
    expect(screen.getByText("$48.95")).toBeInTheDocument();
    expect(screen.getByText("Валовая прибыль")).toBeInTheDocument();
    expect(screen.getByText("Наличие и поступления")).toBeInTheDocument();
    expect(screen.getByText("24 шт.")).toBeInTheDocument();

    const text = container.textContent ?? "";
    expect(text.indexOf("Изображение товара")).toBeLessThan(text.indexOf("IP Camera"));
    expect(text.indexOf("Camera description")).toBeLessThan(text.indexOf("В корзину"));
    expect(text.indexOf("В корзину")).toBeLessThan(text.indexOf("Коммерческое предложение"));
    expect(text.indexOf("Коммерческое предложение")).toBeLessThan(text.indexOf("Наличие и поступления"));
  });

  it("shows only technical attributes in Characteristics", () => {
    render(<ProductDetail activeTab="characteristics" commercialView={commercialView} product={product} />);
    expect(screen.getByText("Resolution")).toBeInTheDocument();
    expect(screen.getByText("4 MPX")).toBeInTheDocument();
    expect(screen.queryByText("Партнёрская цена")).not.toBeInTheDocument();
    expect(screen.queryByText("Наличие и поступления")).not.toBeInTheDocument();
    expect(screen.queryByText("Открыть документ")).not.toBeInTheDocument();
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
  });

  it("reserves Pricing for history without duplicating the current offer", () => {
    render(<ProductDetail activeTab="pricing" commercialView={commercialView} product={product} />);
    expect(screen.getByText("История изменения цен пока недоступна")).toBeInTheDocument();
    expect(screen.queryByText("Партнёрская цена")).not.toBeInTheDocument();
    expect(screen.queryByText("Розничная цена")).not.toBeInTheDocument();
    expect(screen.queryByText("Наличие и поступления")).not.toBeInTheDocument();
  });

  it("renders all four compact tab destinations", () => {
    render(<ProductDetail product={product} />);
    expect(screen.getByRole("link", { name: "Описание" })).toHaveAttribute("href", "?tab=description");
    expect(screen.getByRole("link", { name: "Характеристики" })).toHaveAttribute("href", "?tab=characteristics");
    expect(screen.getByRole("link", { name: "Datasheet" })).toHaveAttribute("href", "?tab=datasheet");
    expect(screen.getByRole("link", { name: "Ценообразование" })).toHaveAttribute("href", "?tab=pricing");
  });
});

const product = { id: "product-1", sku: "NV-100", name: "IP Camera", slug: "ip-camera", shortDescription: null, description: "Camera description", imageUrl: null, brand: { id: "brand-1", name: "Dahua", slug: "dahua", description: null, logoUrl: null, sortOrder: 0, isActive: true }, category: null, keyCharacteristics: [{ label: "Resolution", value: "4 MPX" }], datasheet: null, images: [], documents: [] };
const datasheetDocument = { id: "datasheet-1", title: "Datasheet", documentType: "datasheet", url: "https://example.com/camera.pdf" };
const commercialView = { productId: "product-1", partnerPrice: { currencyCode: "USD", amount: 48.95, formattedAmount: "$48.95", lastUpdatedAt: "2026-07-15T02:00:00Z" }, retailPrice: { currencyCode: "MDL", amount: 1526, formattedAmount: "1 526,00 MDL", lastUpdatedAt: "2026-07-15T02:00:00Z" }, commercialOpportunity: { retailPriceUsd: 89, grossProfitUsd: 40.05, markupPercent: 81.82, formattedGrossProfit: "$40.05", formattedMarkup: "81.82%" }, stock: { status: "in_stock" as const, label: "В наличии: 8 шт.", exactAvailableQuantity: 8, exactPhysicalQuantity: 10, exactReservedQuantity: 2, exactIncomingQuantity: 91, expectedArrival: { expectedQuantity: 24, expectedDate: "2026-07-28", formattedExpectedDate: "28 июля 2026 г.", sourceStatus: "confirmed_supply" as const }, hasVariantStock: false, lastUpdatedAt: "2026-07-15T02:00:00Z" }, isDemoData: false };

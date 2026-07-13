import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductDetail } from "../ProductDetail";

vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("../ProductImageGallery", () => ({ ProductImageGallery: () => <div>Gallery</div> }));
vi.mock("../../../orders/components", () => ({ AddToCartButton: () => <button type="button">В корзину</button> }));

describe("ProductDetail pricing", () => {
  it("uses the shared price labels while retaining useful attributes", () => {
    render(<ProductDetail commercialView={{ productId: "product-1", partnerPrice: { currencyCode: "USD", amount: 45.81, formattedAmount: "$45.81" }, retailPrice: { currencyCode: "MDL", amount: 39.2, formattedAmount: "39.20 MDL" }, stock: null, isDemoData: false }} product={product} />);
    expect(screen.getByText("Партнёрская")).toBeInTheDocument();
    expect(screen.getByText("Розница")).toBeInTheDocument();
    expect(screen.getByText("Resolution")).toBeInTheDocument();
    expect(screen.getByText("4 MPX")).toBeInTheDocument();
    expect(screen.queryByText("Валовая прибыль")).not.toBeInTheDocument();
    expect(screen.queryByText("Наценка")).not.toBeInTheDocument();
  });

  it("shows the confirmed supplier-arrival quantity instead of raw incoming stock", () => {
    render(<ProductDetail commercialView={{ productId: "product-1", partnerPrice: null, retailPrice: null, stock: { status: "expected", label: "Ожидается к поступлению\n28 июля 2026 г.", exactAvailableQuantity: 0, exactPhysicalQuantity: 0, exactReservedQuantity: 0, exactIncomingQuantity: 91, expectedArrival: { expectedQuantity: 24, expectedDate: "2026-07-28", formattedExpectedDate: "28 июля 2026 г.", sourceStatus: "confirmed_supply" }, hasVariantStock: false, lastUpdatedAt: "2026-07-12T22:37:32.000Z" }, isDemoData: false }} product={product} />);

    expect(screen.getByText("Ближайшее поступление")).toBeInTheDocument();
    expect(screen.getByText("24 шт.")).toBeInTheDocument();
    expect(screen.getByText("Дата поступления")).toBeInTheDocument();
    expect(screen.getByText("28 июля 2026 г.")).toBeInTheDocument();
    expect(screen.queryByText("Incoming quantity")).not.toBeInTheDocument();
    expect(screen.queryByText("91")).not.toBeInTheDocument();
  });

  it("shows current stock and the nearest arrival at the same time", () => {
    render(<ProductDetail commercialView={{ productId: "product-1", partnerPrice: null, retailPrice: null, stock: { status: "in_stock", label: "В наличии: 8 шт.", exactAvailableQuantity: 8, exactPhysicalQuantity: 10, exactReservedQuantity: 2, exactIncomingQuantity: 91, expectedArrival: { expectedQuantity: 24, expectedDate: "2026-07-28", formattedExpectedDate: "28 июля 2026 г.", sourceStatus: "confirmed_supply" }, hasVariantStock: false, lastUpdatedAt: "2026-07-12T22:37:32.000Z" }, isDemoData: false }} product={product} />);

    expect(screen.getByText("В наличии: 8 шт.")).toBeInTheDocument();
    expect(screen.getByText("24 шт.")).toBeInTheDocument();
    expect(screen.queryByText("91")).not.toBeInTheDocument();
  });

  it("renders prepared gross profit and markup without calculating in React", () => {
    render(<ProductDetail commercialView={{ productId: "product-1", partnerPrice: { currencyCode: "USD", amount: 48.95, formattedAmount: "$48.95" }, retailPrice: { currencyCode: "MDL", amount: 1526, formattedAmount: "1\u00a0526,00 MDL" }, commercialOpportunity: { retailPriceUsd: 89, grossProfitUsd: 40.05, markupPercent: 81.82, formattedGrossProfit: "$40.05", formattedMarkup: "81.82%" }, stock: null, isDemoData: false }} product={product} />);

    expect(screen.getByText("Валовая прибыль")).toBeInTheDocument();
    expect(screen.getByText("$40.05")).toBeInTheDocument();
    expect(screen.getByText("Наценка")).toBeInTheDocument();
    expect(screen.getByText("81.82%")).toBeInTheDocument();
  });

  it("renders a datasheet as an external document link", () => {
    render(<ProductDetail product={{ ...product, datasheet: datasheetDocument, documents: [datasheetDocument] }} />);

    expect(screen.queryByText("datasheetURL")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open document" })).toHaveAttribute("href", "https://example.com/camera.pdf");
    expect(screen.getByRole("link", { name: "Open document" })).toHaveAttribute("target", "_blank");
    expect(screen.queryByText("Product documents are not available yet.")).not.toBeInTheDocument();
  });
});

const product = { id: "product-1", sku: "NV-100", name: "IP Camera", slug: "ip-camera", shortDescription: null, description: "Camera", imageUrl: null, brand: null, category: null, keyCharacteristics: [{ label: "Resolution", value: "4 MPX" }], datasheet: null, images: [], documents: [] };
const datasheetDocument = { id: "datasheet-1", title: "Datasheet", documentType: "datasheet", url: "https://example.com/camera.pdf" };

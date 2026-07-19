import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { resolveWorkspaceCapabilities } from "../../../partner-cabinet/services";
import { ProductCard } from "../ProductCard";

vi.mock("../../../orders/components/AddToCartButton", () => ({ AddToCartButton: () => <button type="button">Add</button> }));

vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("../../../orders/components", () => ({ AddToCartButton: () => <button type="button">В корзину</button> }));

const product = { id: "product-1", sku: "NV-100", name: "IP Camera", slug: "ip-camera", shortDescription: "Professional camera", imageUrl: null, brand: null, category: { id: "category-1", parentId: null, name: "4-5 MPX", slug: "4-5-mpx", description: null }, keyCharacteristics: [{ label: "Channels", value: "4" }, { label: "Enabled", value: "Да" }], datasheet: null };
const commercialView = { productId: "product-1", partnerPrice: { currencyCode: "USD", amount: 45.81, formattedAmount: "$45.81" }, retailPrice: { currencyCode: "MDL", amount: 39.2, formattedAmount: "39.20 MDL" }, stock: { status: "expected" as const, label: "Ожидается", exactAvailableQuantity:0,exactPhysicalQuantity:0,exactReservedQuantity:0,exactIncomingQuantity:12,expectedArrival:null,hasVariantStock:false,lastUpdatedAt: "2026-07-11T00:00:00.000Z" }, isDemoData: false };

describe("ProductCard workspace context", () => {
  it("presents scoped and retail prices with public business labels", () => {
    const capabilities = resolveWorkspaceCapabilities(new Set(["catalog.view", "prices.view", "stock.view"])).productCard;
    const { container } = render(<ProductCard capabilities={capabilities} commercialView={commercialView} product={product} />);
    expect(screen.getByText("ПАРТНЁРСКАЯ")).toBeInTheDocument();
    expect(screen.getByText("$45.81")).toBeInTheDocument();
    expect(screen.getByText("РОЗНИЧНАЯ")).toBeInTheDocument();
    expect(screen.getByText("39.20 MDL")).toBeInTheDocument();
    expect(container.textContent).not.toContain("GOLD");
    expect(container.textContent).not.toContain("999");
  });

  it("does not use retail as fallback when partner price is missing", () => {
    const capabilities = resolveWorkspaceCapabilities(new Set(["catalog.view", "prices.view"])).productCard;
    render(<ProductCard capabilities={capabilities} commercialView={{ ...commercialView, partnerPrice: null }} product={product} />);
    expect(screen.getByText("39.20 MDL")).toBeInTheDocument();
    expect(screen.getByText("Цена уточняется")).toBeInTheDocument();
    expect(screen.queryByText("$45.81")).not.toBeInTheDocument();
  });

  it("keeps partner price when retail is missing", () => {
    const capabilities = resolveWorkspaceCapabilities(new Set(["catalog.view", "prices.view"])).productCard;
    render(<ProductCard capabilities={capabilities} commercialView={{ ...commercialView, retailPrice: null }} product={product} />);
    expect(screen.getByText("$45.81")).toBeInTheDocument();
    expect(screen.getByText("Цена уточняется")).toBeInTheDocument();
  });

  it("renders the projected product image and isolates the missing-image fallback", () => {
    const capabilities = resolveWorkspaceCapabilities(new Set(["catalog.view"])).productCard;
    const { rerender } = render(<ProductCard capabilities={capabilities} product={{ ...product, imageUrl: "https://example.test/camera.png" }} />);
    expect(screen.getByRole("img", { name: "IP Camera" })).toHaveAttribute("src", "https://example.test/camera.png");

    rerender(<ProductCard capabilities={capabilities} product={{ ...product, id: "product-2", imageUrl: null }} />);
    expect(screen.getByRole("img", { name: "IP Camera" })).toHaveAttribute("src", "/product-placeholder.svg");
  });

  it("removes low-value listing metadata and raw attribute chips", () => {
    const capabilities = resolveWorkspaceCapabilities(new Set(["catalog.view"])).productCard;
    const { container } = render(<ProductCard capabilities={capabilities} product={product} />);
    expect(container.textContent).not.toContain("Бренд не указан");
    expect(container.textContent).not.toContain("4-5 MPX");
    expect(screen.queryByText("4")).not.toBeInTheDocument();
    expect(screen.queryByText("Да")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Подробнее" })).toBeInTheDocument();
  });

  it("does not render commercial values when permissions deny them", () => {
    const capabilities = resolveWorkspaceCapabilities(new Set(["catalog.view"])).productCard;
    render(<ProductCard capabilities={capabilities} commercialView={commercialView} product={product} />);
    expect(screen.queryByText("$45.81")).not.toBeInTheDocument();
    expect(screen.queryByText("Ожидается")).not.toBeInTheDocument();
  });
  it("shows exact public stock quantity",()=>{const capabilities=resolveWorkspaceCapabilities(new Set(["catalog.view","stock.view"])).productCard;render(<ProductCard capabilities={capabilities} commercialView={{...commercialView,stock:{...commercialView.stock,status:"in_stock",label:"В наличии: 12 шт.",exactAvailableQuantity:12}}} product={product}/>);expect(screen.getByText("В наличии: 12 шт.")).toBeInTheDocument();});
  it("shows the localized confirmed supplier arrival date",()=>{const capabilities=resolveWorkspaceCapabilities(new Set(["catalog.view","stock.view"])).productCard;render(<ProductCard capabilities={capabilities} commercialView={{...commercialView,stock:{...commercialView.stock,status:"expected",label:"Ожидается к поступлению\n1 августа 2026 г.",expectedArrival:{expectedQuantity:5,expectedDate:"2026-08-01",sourceStatus:"confirmed_supply"}}}} product={product}/>);expect(screen.getByText(/Ожидается к поступлению/)).toBeInTheDocument();expect(screen.getByText(/1 августа 2026 г\./)).toBeInTheDocument();});
});

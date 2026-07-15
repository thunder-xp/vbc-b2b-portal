import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getCommercial: vi.fn(),
  getWorkspace: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/src/modules/catalog/actions", () => ({ getCatalogProductDetailAction: mocks.getProduct }));
vi.mock("@/src/modules/pricing-inventory/actions", () => ({ getProductCommercialViewsAction: mocks.getCommercial }));
vi.mock("@/src/modules/partner-cabinet/actions", () => ({ getPartnerWorkspaceContextAction: mocks.getWorkspace }));
vi.mock("@/src/modules/catalog/components/ProductImageGallery", () => ({ ProductImageGallery: () => <div>Gallery</div> }));
vi.mock("@/src/modules/orders/components", () => ({ AddToCartButton: () => <button type="button">В корзину</button> }));

import ProductDetailPage from "../page";

describe("product detail page data loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProduct.mockResolvedValue({ success: true, data: product });
    mocks.getCommercial.mockResolvedValue({ success: true, data: [commercialView] });
    mocks.getWorkspace.mockResolvedValue({ success: true, data: { capabilities: { productCard: { canAddToOrder: true } } } });
  });

  it("loads current commercial data once for the initial Description render", async () => {
    render(await ProductDetailPage({ params: Promise.resolve({ slug: "ip-camera" }), searchParams: Promise.resolve({}) }));
    expect(mocks.getCommercial).toHaveBeenCalledOnce();
    expect(mocks.getCommercial).toHaveBeenCalledWith(["product-1"]);
    expect(screen.getByText("Партнёрская цена")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В корзину" })).toBeInTheDocument();
  });

  it("does not load current commercial or workspace data for Pricing history", async () => {
    render(await ProductDetailPage({ params: Promise.resolve({ slug: "ip-camera" }), searchParams: Promise.resolve({ tab: "pricing" }) }));
    expect(mocks.getCommercial).not.toHaveBeenCalled();
    expect(mocks.getWorkspace).not.toHaveBeenCalled();
    expect(screen.getByText("История изменения цен пока недоступна")).toBeInTheDocument();
  });
});

const product = { id: "product-1", sku: "NV-100", name: "IP Camera", slug: "ip-camera", shortDescription: null, description: "Camera description", imageUrl: null, brand: null, category: null, keyCharacteristics: [], datasheet: null, images: [], documents: [] };
const commercialView = { productId: "product-1", partnerPrice: { currencyCode: "USD", amount: 48.95, formattedAmount: "$48.95", lastUpdatedAt: "2026-07-15T02:00:00Z" }, retailPrice: null, stock: null, isDemoData: false };

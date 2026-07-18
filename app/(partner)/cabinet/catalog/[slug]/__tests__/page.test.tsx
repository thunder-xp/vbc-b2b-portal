import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIdentity: vi.fn(),
  getProduct: vi.fn(),
  getCommercial: vi.fn(),
  getWorkspace: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/src/modules/catalog/actions/product-page.action", () => ({
  getCatalogProductRouteIdentityAction: mocks.getIdentity,
  getCatalogProductDetailByIdAction: mocks.getProduct,
}));
vi.mock("@/src/modules/pricing-inventory/actions", () => ({ getProductCommercialViewsAction: mocks.getCommercial }));
vi.mock("@/src/modules/partner-cabinet/actions", () => ({ getPartnerWorkspaceContextAction: mocks.getWorkspace }));
vi.mock("@/src/modules/catalog/components/ProductImageGallery", () => ({ ProductImageGallery: () => <div>Gallery</div> }));
vi.mock("@/src/modules/orders/components/AddToCartButton", () => ({ AddToCartButton: () => <button type="button">В корзину</button> }));
vi.mock("@/src/modules/catalog/components/ProductActions", () => ({ ProductActions: () => <button type="button">В корзину</button> }));
vi.mock("@/src/modules/catalog/components/ExpandableDescription", () => ({ ExpandableDescription: ({ text }: { text: string }) => <p>{text}</p> }));

import ProductDetailPage from "../page";

describe("product detail page data loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getIdentity.mockResolvedValue({ success: true, data: { id: "product-1", slug: "ip-camera" } });
    mocks.getProduct.mockResolvedValue({ success: true, data: product });
    mocks.getCommercial.mockResolvedValue({ success: true, data: [commercialView] });
    mocks.getWorkspace.mockResolvedValue({ success: true, data: { companyId: "company-1", capabilities: { productCard: { canAddToOrder: true } } } });
  });

  it("loads current commercial data once for the initial Description render", async () => {
    render(await ProductDetailPage({ params: Promise.resolve({ slug: "ip-camera" }), searchParams: Promise.resolve({}) }));
    expect(mocks.getCommercial).toHaveBeenCalledOnce();
    expect(mocks.getCommercial).toHaveBeenCalledWith(["product-1"]);
    expect(screen.getByText("Партнёрская цена")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В корзину" })).toBeInTheDocument();
  });

  it("starts detail, commercial, and workspace reads together after route identity", async () => {
    let resolveProduct!: (value: { success: true; data: typeof product }) => void;
    mocks.getProduct.mockReturnValue(new Promise((resolve) => { resolveProduct = resolve; }));

    const page = ProductDetailPage({ params: Promise.resolve({ slug: "ip-camera" }), searchParams: Promise.resolve({}) });

    await vi.waitFor(() => {
      expect(mocks.getProduct).toHaveBeenCalledWith("product-1");
      expect(mocks.getCommercial).toHaveBeenCalledWith(["product-1"]);
      expect(mocks.getWorkspace).toHaveBeenCalledOnce();
    });
    resolveProduct({ success: true, data: product });
    render(await page);
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

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIdentity: vi.fn(),
  getProduct: vi.fn(),
  getCommercial: vi.fn(),
  getRetailHistory: vi.fn(),
  getWorkspace: vi.fn(),
  getRelationSections: vi.fn(),
  getRelationSummary: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/src/modules/catalog/actions/product-page.action", () => ({
  getCatalogProductRouteIdentityAction: mocks.getIdentity,
  getCatalogProductDetailByIdAction: mocks.getProduct,
}));
vi.mock("@/src/modules/pricing-inventory/actions", () => ({ getProductCommercialViewsAction: mocks.getCommercial, getRetailPriceHistoryAction: mocks.getRetailHistory }));
vi.mock("@/src/modules/partner-cabinet/actions", () => ({ getPartnerWorkspaceContextAction: mocks.getWorkspace }));
vi.mock("@/src/modules/purchasing-lists/actions", () => ({ listFavoriteProductIdsAction: vi.fn() }));
vi.mock("@/src/modules/product-relations", () => ({
  getProductRelationSectionsAction: mocks.getRelationSections,
  getProductRelationSummaryAction: mocks.getRelationSummary,
  ProductRelationSectionsView: ({ sections }: { sections: { analogs: unknown[]; related: unknown[] } }) => <div>Relations {sections.analogs.length}/{sections.related.length}</div>,
}));
vi.mock("@/src/modules/behavior-analytics/components", () => ({
  BehaviorViewEvent: ({ eventName }: { eventName: string }) => (
    <span data-event-name={eventName} data-testid="behavior-event" />
  ),
}));
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
    mocks.getRetailHistory.mockResolvedValue({ success: true, data: retailHistory });
    mocks.getWorkspace.mockResolvedValue({ success: true, data: { companyId: "company-1", capabilities: { productCard: { canAddToOrder: true } } } });
    mocks.getRelationSummary.mockResolvedValue({ success: true, data: { hasAnalogs: true, hasRelated: true } });
    mocks.getRelationSections.mockResolvedValue({ success: true, data: { analogs: [{ id: "analog-1" }], related: [{ id: "related-1" }], synchronizedAt: null } });
  });

  it("loads current commercial data once for the initial Overview render", async () => {
    render(await ProductDetailPage({ params: Promise.resolve({ slug: "ip-camera" }), searchParams: Promise.resolve({}) }));
    expect(mocks.getCommercial).toHaveBeenCalledOnce();
    expect(mocks.getCommercial).toHaveBeenCalledWith(["product-1"]);
    expect(mocks.getRelationSummary).toHaveBeenCalledWith("product-1");
    expect(mocks.getRelationSections).not.toHaveBeenCalled();
    expect(screen.getByText("Ваша цена")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В корзину" })).toBeInTheDocument();
    expect(
      screen.getAllByTestId("behavior-event").map((node) => node.dataset.eventName),
    ).toEqual(["product_viewed", "product_overview_viewed"]);
  });

  it("loads heavy relation enrichment only for the relations tab", async () => {
    render(await ProductDetailPage({ params: Promise.resolve({ slug: "ip-camera" }), searchParams: Promise.resolve({ tab: "relations" }) }));
    expect(mocks.getRelationSections).toHaveBeenCalledWith("product-1");
    expect(mocks.getRelationSummary).not.toHaveBeenCalled();
    expect(mocks.getCommercial).toHaveBeenCalledWith(["product-1"]);
    expect(mocks.getWorkspace).toHaveBeenCalledOnce();
    expect(screen.getByText("Relations 1/1")).toBeInTheDocument();
    expect(screen.queryByTestId("product-overview-tab")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("behavior-event").map((node) => node.dataset.eventName)).toEqual(["product_viewed", "product_relations_tab_viewed"]);
  });

  it("starts detail, commercial, and workspace reads together after route identity", async () => {
    let resolveProduct!: (value: { success: true; data: typeof product }) => void;
    mocks.getProduct.mockReturnValue(new Promise((resolve) => { resolveProduct = resolve; }));

    const page = ProductDetailPage({ params: Promise.resolve({ slug: "ip-camera" }), searchParams: Promise.resolve({}) });

    await vi.waitFor(() => {
      expect(mocks.getProduct).toHaveBeenCalledWith("product-1", {
        includeAttributes: true,
        includeDocuments: false,
        includeImages: true,
      });
      expect(mocks.getCommercial).toHaveBeenCalledWith(["product-1"]);
      expect(mocks.getWorkspace).toHaveBeenCalledOnce();
    });
    resolveProduct({ success: true, data: product });
    render(await page);
  });

  it("loads only canonical RETAIL history for Pricing", async () => {
    render(await ProductDetailPage({ params: Promise.resolve({ slug: "ip-camera" }), searchParams: Promise.resolve({ tab: "pricing" }) }));
    expect(mocks.getCommercial).not.toHaveBeenCalled();
    expect(mocks.getWorkspace).not.toHaveBeenCalled();
    expect(mocks.getRelationSections).not.toHaveBeenCalled();
    expect(mocks.getRelationSummary).not.toHaveBeenCalled();
    expect(mocks.getRetailHistory).toHaveBeenCalledWith("product-1", undefined);
    expect(screen.getByText("История розничной цены")).toBeInTheDocument();
    expect(screen.getByText("2 399,00 MDL")).toBeInTheDocument();
  });

  it("loads documents only for the Datasheet tab", async () => {
    render(await ProductDetailPage({ params: Promise.resolve({ slug: "ip-camera" }), searchParams: Promise.resolve({ tab: "datasheet" }) }));
    expect(mocks.getProduct).toHaveBeenCalledWith("product-1", {
      includeAttributes: true,
      includeDocuments: true,
      includeImages: false,
    });
    expect(screen.getByText("Инструкции для этого товара пока не опубликованы.")).toBeInTheDocument();
    expect(screen.queryByText("Центр документов")).not.toBeInTheDocument();
    expect(screen.queryByText("Дополнительные сертификаты и инструкции пока не опубликованы.")).not.toBeInTheDocument();
  });

  it("loads text only for Description without commercial or image reads", async () => {
    render(await ProductDetailPage({
      params: Promise.resolve({ slug: "ip-camera" }),
      searchParams: Promise.resolve({ tab: "description" }),
    }));

    expect(mocks.getCommercial).not.toHaveBeenCalled();
    expect(mocks.getWorkspace).not.toHaveBeenCalled();
    expect(mocks.getProduct).toHaveBeenCalledWith("product-1", {
      includeAttributes: false,
      includeDocuments: false,
      includeImages: false,
    });
    expect(screen.getByText("Camera description")).toBeInTheDocument();
    expect(
      screen.getAllByTestId("behavior-event").map((node) => node.dataset.eventName),
    ).toEqual(["product_viewed", "product_description_viewed"]);
  });
});

const product = { id: "product-1", sku: "NV-100", name: "IP Camera", slug: "ip-camera", shortDescription: null, description: "Camera description", imageUrl: null, brand: null, category: null, keyCharacteristics: [], datasheet: null, images: [], documents: [] };
const commercialView = { productId: "product-1", partnerPrice: { currencyCode: "USD", amount: 48.95, formattedAmount: "$48.95", lastUpdatedAt: "2026-07-15T02:00:00Z" }, retailPrice: null, stock: null, isDemoData: false };
const retailHistory = { current: { amount: 2399, currency: "MDL", effectiveAt: "2026-07-12T00:00:00Z" }, points: [{ amount: 2399, currency: "MDL", effectiveAt: "2026-07-12T00:00:00Z", source: "initial_baseline" }], firstAt: "2026-07-12T00:00:00Z", lastAt: "2026-07-12T00:00:00Z", previousAmount: null, minimumAmount: 2399, maximumAmount: 2399, mode: "baseline_only", range: "12m", truncated: false, formattedCurrent: "2 399,00 MDL", formattedPrevious: null, formattedMinimum: "2 399,00 MDL", formattedMaximum: "2 399,00 MDL", formattedAbsoluteChange: null, formattedPercentageChange: null };

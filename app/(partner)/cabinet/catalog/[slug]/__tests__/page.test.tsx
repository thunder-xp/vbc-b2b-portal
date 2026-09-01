import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCommercial: vi.fn(), getCompetitive: vi.fn(), getCompetitorPricing: vi.fn(),
  getIdentity: vi.fn(), getKnowledge: vi.fn(), getMerchandising: vi.fn(), getProduct: vi.fn(),
  getRelationSections: vi.fn(), getRelationSummary: vi.fn(), getRetailHistory: vi.fn(),
  getWorkspace: vi.fn(), listFavorites: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/src/modules/catalog/actions/product-page.action", () => ({ getCatalogProductRouteIdentityAction: mocks.getIdentity, getCatalogProductDetailByIdAction: mocks.getProduct }));
vi.mock("@/src/modules/catalog/actions", () => ({ getProductMerchandisingLabelsAction: mocks.getMerchandising }));
vi.mock("@/src/modules/pricing-inventory/actions", () => ({ getProductCommercialViewsAction: mocks.getCommercial, getRetailPriceHistoryAction: mocks.getRetailHistory }));
vi.mock("@/src/modules/partner-cabinet/actions", () => ({ getPartnerWorkspaceContextAction: mocks.getWorkspace }));
vi.mock("@/src/modules/purchasing-lists/actions", () => ({ listFavoriteProductIdsAction: mocks.listFavorites }));
vi.mock("@/src/modules/knowledge-base/actions", () => ({ getProductKnowledgeAction: mocks.getKnowledge }));
vi.mock("@/src/modules/product-relations", () => ({
  getProductRelationSectionsAction: mocks.getRelationSections,
  getProductRelationSummaryAction: mocks.getRelationSummary,
  ProductRelationSectionsView: ({ sections }: { sections: { analogs: unknown[]; related: unknown[] } }) => <div>Relations {sections.analogs.length}/{sections.related.length}</div>,
}));
vi.mock("@/src/modules/behavior-analytics/components", () => ({ BehaviorViewEvent: ({ eventName }: { eventName: string }) => <span data-event-name={eventName} data-testid="behavior-event" /> }));
vi.mock("@/src/modules/catalog/components/ProductImageGallery", () => ({ ProductImageGallery: () => <div>Gallery</div> }));
vi.mock("@/src/modules/catalog/components/ProductActions", () => ({ ProductActions: () => <button type="button">Add to cart</button> }));
vi.mock("@/src/modules/catalog/components/ExpandableDescription", () => ({ ExpandableDescription: ({ text }: { text: string }) => <p>{text}</p> }));
vi.mock("@/src/modules/catalog/components/ProductDetailNavigation", () => ({ ProductDetailNavigation: () => <nav>Product tabs</nav> }));
vi.mock("@/src/modules/competitive-intelligence", () => ({ PartnerProductCompetitiveIntelligenceService: class { getPartnerProduct = mocks.getCompetitive; } }));
vi.mock("@/src/modules/competitive-intelligence/components", () => ({ ProductCompetitiveIntelligence: () => <div>Own competitive observations</div> }));
vi.mock("@/src/modules/competitive-intelligence/retail-pricing.service", () => ({ CompetitorRetailPricingService: class { getProductPricing = mocks.getCompetitorPricing; } }));

import ProductDetailLayout from "../layout";
import ProductDetailPage from "../page";

describe("product detail retained shell and tab boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getIdentity.mockResolvedValue({ success: true, data: { id: "product-1", slug: "ip-camera" } });
    mocks.getProduct.mockResolvedValue({ success: true, data: product });
    mocks.getCommercial.mockResolvedValue({ success: true, data: [commercialView] });
    mocks.getRetailHistory.mockResolvedValue({ success: true, data: retailHistory });
    mocks.getWorkspace.mockResolvedValue({ success: true, data: { companyId: "company-1", userId: "user-1", capabilities: { productCard: { canAddToOrder: true, canManagePurchasingLists: true }, canViewCompetitiveIntelligence: true } } });
    mocks.getCompetitive.mockResolvedValue({ canManage: true, competitors: [], observations: [], summary: { observationCount: 0 } });
    mocks.getCompetitorPricing.mockResolvedValue([]);
    mocks.listFavorites.mockResolvedValue({ success: true, data: [] });
    mocks.getMerchandising.mockResolvedValue({ success: true, data: [] });
    mocks.getKnowledge.mockResolvedValue({ success: true, data: [] });
    mocks.getRelationSummary.mockResolvedValue({ success: true, data: { hasAnalogs: true, hasRelated: true } });
    mocks.getRelationSections.mockResolvedValue({ success: true, data: { analogs: [{}], related: [{}], synchronizedAt: null } });
  });

  it("loads common shell reads in the slug layout", async () => {
    render(await ProductDetailLayout({ children: <div>Tab content</div>, params: Promise.resolve({ slug: "ip-camera" }) }));
    expect(mocks.getProduct).toHaveBeenCalledWith("product-1", { includeAttributes: false, includeDocuments: false, includeImages: true });
    expect(mocks.getWorkspace).toHaveBeenCalledOnce();
    expect(mocks.getMerchandising).toHaveBeenCalledWith("product-1");
    expect(mocks.listFavorites).toHaveBeenCalledWith(["product-1"]);
    expect(mocks.getCommercial).not.toHaveBeenCalled();
    expect(screen.getByText("Gallery")).toBeInTheDocument();
    expect(screen.getByText("Tab content")).toBeInTheDocument();
    expect(screen.getByTestId("behavior-event")).toHaveAttribute("data-event-name", "product_viewed");
  });

  it("loads no shell projection or workspace for Description", async () => {
    render(await ProductDetailPage({ params: Promise.resolve({ slug: "ip-camera" }), searchParams: Promise.resolve({ tab: "description" }) }));
    expect(mocks.getProduct).toHaveBeenCalledWith("product-1", { includeAttributes: false, includeDocuments: false, includeImages: false });
    expect(mocks.getWorkspace).not.toHaveBeenCalled();
    expect(mocks.getMerchandising).not.toHaveBeenCalled();
    expect(mocks.listFavorites).not.toHaveBeenCalled();
    expect(screen.getByText("Camera description")).toBeInTheDocument();
  });

  it("loads only canonical retail history for Pricing", async () => {
    render(await ProductDetailPage({ params: Promise.resolve({ slug: "ip-camera" }), searchParams: Promise.resolve({ tab: "pricing" }) }));
    expect(mocks.getRetailHistory).toHaveBeenCalledWith("product-1", "all");
    expect(mocks.getProduct).not.toHaveBeenCalled();
    expect(mocks.getWorkspace).not.toHaveBeenCalled();
    expect(mocks.getCommercial).not.toHaveBeenCalled();
  });

  it("loads the documents projection only for Datasheet", async () => {
    await ProductDetailPage({ params: Promise.resolve({ slug: "ip-camera" }), searchParams: Promise.resolve({ tab: "datasheet" }) });
    expect(mocks.getProduct).toHaveBeenCalledWith("product-1", { includeAttributes: true, includeDocuments: true, includeImages: false });
    expect(mocks.getRetailHistory).not.toHaveBeenCalled();
  });

  it("loads only authorized competitive intelligence for Analytics", async () => {
    render(await ProductDetailPage({ params: Promise.resolve({ slug: "ip-camera" }), searchParams: Promise.resolve({ tab: "analytics" }) }));
    expect(mocks.getWorkspace).toHaveBeenCalledOnce();
    expect(mocks.getCompetitive).toHaveBeenCalledWith("company-1", "product-1");
    expect(mocks.getProduct).not.toHaveBeenCalled();
    expect(mocks.getCommercial).not.toHaveBeenCalled();
    expect(screen.getByText("Own competitive observations")).toBeInTheDocument();
  });

  it("maps legacy relations to Analogues without unrelated reads", async () => {
    render(await ProductDetailPage({ params: Promise.resolve({ slug: "ip-camera" }), searchParams: Promise.resolve({ tab: "relations" }) }));
    expect(mocks.getRelationSections).toHaveBeenCalledWith("product-1");
    expect(mocks.getRelationSummary).not.toHaveBeenCalled();
    expect(mocks.getCommercial).toHaveBeenCalledWith(["product-1"]);
    expect(mocks.getProduct).not.toHaveBeenCalled();
    expect(screen.getByText("Relations 1/1")).toBeInTheDocument();
  });
});

const product = { id: "product-1", sku: "NV-100", name: "IP Camera", slug: "ip-camera", shortDescription: null, description: "Camera description", imageUrl: null, brand: null, category: null, keyCharacteristics: [], datasheet: null, images: [], documents: [] };
const commercialView = { productId: "product-1", partnerPrice: { currencyCode: "USD", amount: 48.95, formattedAmount: "$48.95", lastUpdatedAt: "2026-07-15T02:00:00Z" }, retailPrice: null, stock: null, isDemoData: false };
const retailHistory = { current: { amount: 2399, currency: "MDL", effectiveAt: "2026-07-12T00:00:00Z" }, points: [{ amount: 2399, currency: "MDL", effectiveAt: "2026-07-12T00:00:00Z", source: "initial_baseline" }], firstAt: "2026-07-12T00:00:00Z", lastAt: "2026-07-12T00:00:00Z", previousAmount: null, minimumAmount: 2399, maximumAmount: 2399, mode: "baseline_only", range: "12m", truncated: false, formattedCurrent: "2 399,00 MDL", formattedPrevious: null, formattedMinimum: "2 399,00 MDL", formattedMaximum: "2 399,00 MDL", formattedAbsoluteChange: null, formattedPercentageChange: null };

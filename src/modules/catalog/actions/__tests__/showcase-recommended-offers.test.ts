import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ feed: vi.fn(), commercial: vi.fn() }));
vi.mock("../../../access-control/actions/service-factory", () => ({ getAuthenticatedUser: async () => ({ id: "partner", loginGeneration: "1" }), createCompanyAccessService: () => ({}) }));
vi.mock("../../../partner-cabinet/actions/service-factory", () => ({ createPartnerWorkspaceContextService: () => ({ getWorkspaceContext: async () => ({ accessState: "active", companyId: "company", capabilities: { navigation: [{ key: "offers", availability: "available" }] } }) }) }));
vi.mock("../../../merchandising/actions", () => ({ createMerchandisingService: () => ({ listPublished: async () => [] }) }));
vi.mock("../../../commercial-campaigns/actions/partner-offer-feed.actions", () => ({ listPartnerOfferFeedAction: mocks.feed }));
vi.mock("../../../pricing-inventory/actions/service-factory", () => ({ createPricingInventoryService: () => ({ getProductCommercialViews: mocks.commercial }) }));
vi.mock("../../../warehouse-arrivals/repositories", () => ({ SupabaseWarehouseArrivalRepository: class { async getCurrentReplenishmentPreview() { return { items: [], totalCount: 0 }; } } }));
import { listCatalogMerchandisingSectionsAction } from "../list-merchandising-sections.action";

describe("governed Showcase offer preview", () => {
  it("uses the same recommended feed with limit five, without discovery scan or duplicate commercial enrichment", async () => {
    const offers = Array.from({ length: 5 }, (_, index) => ({ offerId: `offer-${index}`, campaign: { products: [] } }));
    mocks.feed.mockResolvedValue({ success: true, data: { items: offers, totalCount: 38 } });
    const result = await listCatalogMerchandisingSectionsAction();
    expect(mocks.feed).toHaveBeenCalledExactlyOnceWith({ sort: "recommended", pageSize: 5 });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Preview failed");
    expect(result.data.sections).toEqual([{ labelCode: "SPECIAL_OFFER", title: "Спецпредложения", products: [], offers, href: "/cabinet/offers", totalCount: 38 }]);
    expect(mocks.commercial).not.toHaveBeenCalled();
  });
});

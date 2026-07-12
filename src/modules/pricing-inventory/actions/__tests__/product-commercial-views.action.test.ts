import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUserId: vi.fn(async () => "user-1"), getViews: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../access-control/actions/service-factory", () => ({ getAuthenticatedUserId: mocks.getUserId }));
vi.mock("../service-factory", () => ({ createPricingInventoryService: () => ({ getProductCommercialViews: mocks.getViews }) }));

import { getProductCommercialViewsAction } from "../product-commercial-views.action";

describe("getProductCommercialViewsAction", () => {
  it("does not expose the internal retail anomaly diagnostic to partner clients", async () => {
    mocks.getViews.mockResolvedValue([{ productId: "product-1", partnerPrice: null, retailPrice: null, stock: null, isDemoData: false, retailBelowPartnerPrice: true }]);
    const result = await getProductCommercialViewsAction(["product-1"]);
    expect(result.success).toBe(true);
    expect(result.data?.[0]).not.toHaveProperty("retailBelowPartnerPrice");
  });
});

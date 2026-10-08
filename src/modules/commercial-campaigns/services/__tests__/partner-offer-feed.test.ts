import { describe, expect, it, vi } from "vitest";
import { OFFER_FEED_KINDS } from "../../offer-feed";
import { PartnerOfferFeedService } from "../partner-offer-feed.service";

describe("offer-first marketplace", () => {
  it("maps all six existing mechanics without inventing cart mechanics", () => {
    expect(OFFER_FEED_KINDS).toEqual({
      legacy_promo: "PRODUCT",
      quantity_threshold_promo: "PRODUCT",
      fixed_bundle_promo: "BUNDLE",
      bundle_special_price: "BUNDLE",
      conditional_attach_promo: "CONDITIONAL",
      spend_threshold_promo: "SPEND_THRESHOLD",
    });
  });
  it("paginates offer identities once and batches unique bounded commercial IDs", async () => {
    const campaign = {
      id: "campaign",
      title: "Published",
      code: "PROMO",
      publicationVersion: 1,
      startsAt: "2020-01-01",
      endsAt: "2099-01-01",
      mechanicType: "legacy_promo",
      products: [
        {
          productId: "p1",
          specialPrice: { amount: 8, currency: "USD" },
          price: { amount: 10, currency: "USD" },
        },
      ],
    };
    const repository = {
      list: vi.fn().mockResolvedValue({
        items: [
          { offerId: "offer1", kind: "PRODUCT", campaign },
          { offerId: "offer2", kind: "PRODUCT", campaign },
        ],
        totalCount: 38,
        categories: [],
        brands: [],
      }),
    };
    const pricing = {
      getProductCommercialViews: vi.fn().mockResolvedValue([]),
    };
    const workspace = {
      getWorkspaceContext: vi
        .fn()
        .mockResolvedValue({ companyId: "company", accessState: "active" }),
    };
    const page = await new PartnerOfferFeedService(
      repository,
      workspace as never,
      pricing as never,
    ).list("partner", {
      page: 2,
      pageSize: 20,
      mechanic: "promo",
      search: "  SKU  ",
    });
    expect(repository.list).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        companyId: "company",
        limit: 20,
        offset: 20,
        mechanic: "promo",
        search: "SKU",
      }),
    );
    expect(pricing.getProductCommercialViews).toHaveBeenCalledExactlyOnceWith(
      "partner",
      ["p1"],
    );
    expect(page).toMatchObject({ totalCount: 38, page: 2, totalPages: 2 });
    expect(page.items.map((x) => x.offerId)).toEqual(["offer1", "offer2"]);
  });
  it("rejects unavailable company context before resolving offers or pricing", async () => {
    const repository = { list: vi.fn() },
      pricing = { getProductCommercialViews: vi.fn() };
    const workspace = {
      getWorkspaceContext: vi
        .fn()
        .mockResolvedValue({ accessState: "pending", companyId: "company" }),
    };
    await expect(
      new PartnerOfferFeedService(
        repository,
        workspace as never,
        pricing as never,
      ).list("partner"),
    ).rejects.toThrow("Partner workspace is unavailable");
    expect(repository.list).not.toHaveBeenCalled();
    expect(pricing.getProductCommercialViews).not.toHaveBeenCalled();
  });
});

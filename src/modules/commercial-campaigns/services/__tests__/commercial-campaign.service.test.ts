import { describe, expect, it, vi } from "vitest";

import type { CommercialCampaignRepository } from "../../repositories";
import { CommercialCampaignService } from "../commercial-campaign.service";
import { SPECIAL_OFFERS_PROMO_PROFILE } from "../../promo-profile";

describe("CommercialCampaignService", () => {
  it("previews five unique active governed products with an exact product count", async () => {
    const repository = stubRepository();
    vi.mocked(repository.listPartner).mockResolvedValue({
      items: [
        { products: Array.from({ length: 7 }, (_, index) => ({ productId: `product-${index}` })) },
        { products: [{ productId: "product-0" }] },
      ] as never,
      totalCount: 2,
    });
    const service = new CommercialCampaignService(repository, workspace() as never);
    expect(await service.getActiveProductPreview("user-1")).toEqual({
      productIds: ["product-0", "product-1", "product-2", "product-3", "product-4"], totalCount: 7,
    });
    expect(repository.listPartner).toHaveBeenCalledExactlyOnceWith({ companyId: "company-1", filter: "active", limit: 50, offset: 0 });
    expect(repository.getPartner).not.toHaveBeenCalled();
  });

  it("counts products across campaign pages without per-product queries", async () => {
    const repository = stubRepository();
    vi.mocked(repository.listPartner)
      .mockResolvedValueOnce({ items: [{ products: [{ productId: "first" }] }] as never, totalCount: 51 })
      .mockResolvedValueOnce({ items: [{ products: [{ productId: "second" }] }] as never, totalCount: 51 });
    const service = new CommercialCampaignService(repository, workspace() as never);
    expect(await service.getActiveProductPreview("user-1")).toEqual({ productIds: ["first", "second"], totalCount: 2 });
    expect(repository.listPartner).toHaveBeenNthCalledWith(2, { companyId: "company-1", filter: "active", limit: 50, offset: 50 });
  });

  it("returns no preview for an empty active projection", async () => {
    const service = new CommercialCampaignService(stubRepository(), workspace() as never);
    expect(await service.getActiveProductPreview("user-1")).toEqual({ productIds: [], totalCount: 0 });
  });
  it("uses one bounded audience-scoped list request", async () => {
    const repository = stubRepository();
    const service = new CommercialCampaignService(repository, workspace() as never);
    await service.listPartner("user-1", { filter: "ending", page: 2, pageSize: 20 });
    expect(repository.listPartner).toHaveBeenCalledWith({ companyId: "company-1", filter: "ending", limit: 20, offset: 20 });
  });

  it("rejects invalid cart quantity before repository mutation", async () => {
    const repository = stubRepository();
    const service = new CommercialCampaignService(repository, workspace() as never);
    await expect(service.addToCart("user-1", "item-1", 0, "request-1", 1)).rejects.toThrow("Campaign quantity is invalid");
    expect(repository.addToCart).not.toHaveBeenCalled();
  });

  it("does not let analytics failure block partner flow", async () => {
    const repository = stubRepository();
    vi.mocked(repository.recordEngagement).mockRejectedValue(new Error("analytics down"));
    const service = new CommercialCampaignService(repository, workspace() as never);
    await expect(service.recordEngagement("user-1", { campaignId: "campaign-1", eventType: "impression", requestId: "request-1" })).resolves.toBeUndefined();
  });

  it("rejects invalid quantity limits before draft mutation", () => {
    const service = new CommercialCampaignService(stubRepository(), workspace() as never);
    expect(() => service.createDraft({ ...validDraft(), items: [{ ...validDraft().items[0], minimumQuantity: 3, maximumQuantityPerCompany: 2 }] })).toThrow("Campaign quantity limits are invalid");
  });

  it("accepts only the exact PROMO reference for an existing price profile", async () => {
    const repository = stubRepository();
    const service = new CommercialCampaignService(repository, workspace() as never);
    expect(() => service.createDraft({ ...validDraft(), items: [{ ...validDraft().items[0], benefitType: "existing_price_profile", governedBenefitReference: null }] })).toThrow("must be PROMO");
    expect(() => service.createDraft({ ...validDraft(), items: [{ ...validDraft().items[0], benefitType: "existing_price_profile", governedBenefitReference: "non-promo-profile" }] })).toThrow("must be PROMO");
    const governed = { ...validDraft(), items: [{ ...validDraft().items[0], benefitType: "existing_price_profile" as const, governedBenefitReference: SPECIAL_OFFERS_PROMO_PROFILE.externalRef }] };
    await service.createDraft(governed);
    expect(repository.createDraft).toHaveBeenCalledWith(governed);
  });

  it("requires a valid per-product threshold for Quantity to PROMO", async () => {
    const repository = stubRepository();
    const service = new CommercialCampaignService(repository, workspace() as never);
    const quantityPromo = { ...validDraft(), mechanicType: "quantity_threshold_promo" as const, items: [{ ...validDraft().items[0], benefitType: "existing_price_profile" as const, governedBenefitReference: SPECIAL_OFFERS_PROMO_PROFILE.externalRef, promoThresholdQuantity: 5 }] };
    await service.createDraft(quantityPromo);
    expect(repository.createDraft).toHaveBeenCalledWith(quantityPromo);
    expect(() => service.createDraft({ ...quantityPromo, items: [{ ...quantityPromo.items[0], promoThresholdQuantity: 0 }] })).toThrow("Quantity → PROMO");
    expect(() => service.createDraft({ ...quantityPromo, items: [{ ...quantityPromo.items[0], maximumQuantityPerCompany: 4 }] })).toThrow("Quantity → PROMO");
  });

  it("keeps catalog and company discovery bounded on the server", async () => {
    const repository = stubRepository();
    const service = new CommercialCampaignService(repository, workspace() as never);
    await service.searchProducts({ search: " 800147 ", page: 2, pageSize: 500, inStockOnly: true });
    await service.searchCompanies(" Partner ", -10);
    expect(repository.searchProducts).toHaveBeenCalledWith({ search: "800147", categoryId: undefined, brandId: undefined, inStockOnly: true, limit: 50, offset: 50 });
    expect(repository.searchCompanies).toHaveBeenCalledWith({ search: "Partner", limit: 25, offset: 0 });
  });

  it("keeps reopen and archived deletion explicit and reasoned", async () => {
    const repository = stubRepository();
    const service = new CommercialCampaignService(repository, workspace() as never);
    await service.reopenForEdit("campaign-1", "  Остановлено для исправления  ");
    await service.deleteArchived("campaign-2", "  Удалено администратором  ");
    expect(repository.reopenForEdit).toHaveBeenCalledWith("campaign-1", "Остановлено для исправления");
    expect(repository.deleteArchived).toHaveBeenCalledWith("campaign-2", "Удалено администратором");
    expect(() => service.reopenForEdit("campaign-1", " ")).toThrow("Campaign reopen reason is required");
    expect(() => service.deleteArchived("campaign-2", "x")).toThrow("Campaign deletion reason is required");
  });
});

function workspace() { return { getWorkspaceContext: vi.fn().mockResolvedValue({ accessState: "active", companyId: "company-1" }) }; }
function validDraft() { return { contractVersion: "3" as const, requestId: "10000000-0000-4000-8000-000000000001", code: "TEST_1", name: "Test campaign", partnerTitle: "Partner offer", partnerDescription: "Long partner campaign description", campaignType: "product_offer" as const, startsAt: "2026-07-31T10:00:00Z", endsAt: "2026-08-31T10:00:00Z", priority: 100, termsSummary: "Current price applies", mechanicType: "legacy_promo" as const, audienceMode: "explicit_company" as const, companyIds: ["company-1"], items: [{ productId: "product-1", sortOrder: 1, minimumQuantity: 1, maximumQuantityPerCompany: null, benefitType: "informational_only" as const, governedBenefitReference: null, partnerMessage: null, promoThresholdQuantity: null }] }; }
function stubRepository(): CommercialCampaignRepository { return { listPartner: vi.fn().mockResolvedValue({ items: [], totalCount: 0 }), getPartner: vi.fn(), addToCart: vi.fn(), completeBundle: vi.fn(), recordEngagement: vi.fn(), getPerformance: vi.fn(), listAdmin: vi.fn(), getAdmin: vi.fn(), getBuilderOptions: vi.fn(), searchProducts: vi.fn(), searchCompanies: vi.fn(), createDraft: vi.fn(), updateDraft: vi.fn(), duplicate: vi.fn(), archive: vi.fn(), resume: vi.fn(), reopenForEdit: vi.fn().mockResolvedValue({ revision: 2 }), deleteArchived: vi.fn(), publish: vi.fn(), pause: vi.fn() }; }

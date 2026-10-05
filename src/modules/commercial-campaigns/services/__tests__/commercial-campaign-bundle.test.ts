import { describe, expect, it, vi } from "vitest";
import type { CommercialCampaignRepository } from "../../repositories";
import type { CampaignDraftInput } from "../../types";
import { SPECIAL_OFFERS_PROMO_PROFILE } from "../../promo-profile";
import { CommercialCampaignService } from "../commercial-campaign.service";

function draft(): CampaignDraftInput {
  return { contractVersion: "3", requestId: "request", code: "BUNDLE", name: "Fixed kit", partnerTitle: "Fixed kit",
    partnerDescription: "A governed complementary product kit", termsSummary: "Complete kit unlocks PROMO", campaignType: "product_offer",
    startsAt: "2026-10-04T10:00:00Z", endsAt: "2026-10-10T10:00:00Z", priority: 1, mechanicType: "fixed_bundle_promo",
    audienceMode: "explicit_company", companyIds: ["company"], items: ["a", "b"].map((productId, sortOrder) => ({ productId, sortOrder,
      minimumQuantity: 1, maximumQuantityPerCompany: null, benefitType: "existing_price_profile", governedBenefitReference: SPECIAL_OFFERS_PROMO_PROFILE.externalRef,
      partnerMessage: null, promoThresholdQuantity: null, requiredBundleQuantity: sortOrder === 0 ? 4 : 1 })) };
}
function fixture(active = true) {
  const repository = { createDraft: vi.fn(), completeBundle: vi.fn() };
  const service = new CommercialCampaignService(repository as unknown as CommercialCampaignRepository,
    { getWorkspaceContext: vi.fn().mockResolvedValue({ accessState: active ? "active" : "pending", companyId: "trusted-company" }) } as never);
  return { repository, service };
}
describe("governed fixed bundle service contract", () => {
  it("accepts two distinct positive component quantities", () => {
    const { service, repository } = fixture(); const input = draft(); service.createDraft(input);
    expect(repository.createDraft).toHaveBeenCalledWith(input);
  });
  it.each([0, -1, 1.5, 10000, null])("rejects invalid required quantity %s before mutation", (quantity) => {
    const { service, repository } = fixture(); const input = draft(); input.items[0].requiredBundleQuantity = quantity;
    expect(() => service.createDraft(input)).toThrow(); expect(repository.createDraft).not.toHaveBeenCalled();
  });
  it("rejects a single product or duplicate products", () => {
    const { service } = fixture(); const input = draft();
    input.items[1].productId = input.items[0].productId; expect(() => service.createDraft(input)).toThrow();
    input.items.pop(); expect(() => service.createDraft(input)).toThrow();
  });
  it("rejects wrong governed profile, informational benefit, cap below requirement and mixed mechanics", () => {
    const { service } = fixture();
    const wrong = draft(); wrong.items[0].governedBenefitReference = "other"; expect(() => service.createDraft(wrong)).toThrow();
    const info = draft(); info.items[0].benefitType = "informational_only"; info.items[0].governedBenefitReference = null; expect(() => service.createDraft(info)).toThrow();
    const cap = draft(); cap.items[0].maximumQuantityPerCompany = 3; expect(() => service.createDraft(cap)).toThrow();
    const mixed = draft(); mixed.items[0].promoThresholdQuantity = 4; expect(() => service.createDraft(mixed)).toThrow();
  });
  it("resolves company context server-side for complete-kit", async () => {
    const { service, repository } = fixture(); await service.completeBundle("actor", "campaign", "request", 1);
    expect(repository.completeBundle).toHaveBeenCalledWith({ companyId: "trusted-company", campaignId: "campaign", requestId: "request", publicationVersion: 1 });
  });
  it("denies an inactive workspace before complete-kit", async () => {
    const { service, repository } = fixture(false);
    await expect(service.completeBundle("actor", "campaign", "request", 1)).rejects.toThrow();
    expect(repository.completeBundle).not.toHaveBeenCalled();
  });
});

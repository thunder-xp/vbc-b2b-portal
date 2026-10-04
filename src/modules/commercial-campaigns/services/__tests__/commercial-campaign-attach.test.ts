import { describe, expect, it, vi } from "vitest";
import type { CommercialCampaignRepository } from "../../repositories";
import type { CampaignDraftInput } from "../../types";
import { SPECIAL_OFFERS_PROMO_PROFILE } from "../../promo-profile";
import { CommercialCampaignService } from "../commercial-campaign.service";

function draft(): CampaignDraftInput {
  return { contractVersion: "3", requestId: "request", code: "ATTACH", name: "Attach", partnerTitle: "Attach",
    partnerDescription: "A governed reward for matching triggers", termsSummary: "Four cameras unlock HDD PROMO", campaignType: "product_offer",
    startsAt: "2026-10-04T10:00:00Z", endsAt: "2026-10-10T10:00:00Z", priority: 1, mechanicType: "conditional_attach_promo",
    audienceMode: "explicit_company", companyIds: ["company"], items: ["a", "c"].map((productId, sortOrder) => ({ productId, sortOrder,
      minimumQuantity: 1, maximumQuantityPerCompany: null, benefitType: sortOrder ? "existing_price_profile" : "informational_only",
      governedBenefitReference: sortOrder ? SPECIAL_OFFERS_PROMO_PROFILE.externalRef : null, partnerMessage: null,
      promoThresholdQuantity: null, attachRole: sortOrder ? "REWARD" : "TRIGGER", requiredTriggerQuantity: sortOrder ? null : 4 })) };
}
function fixture() {
  const repository = { createDraft: vi.fn(), addToCart: vi.fn() };
  const service = new CommercialCampaignService(repository as unknown as CommercialCampaignRepository,
    { getWorkspaceContext: vi.fn().mockResolvedValue({ accessState: "active", companyId: "trusted-company" }) } as never);
  return { repository, service };
}
describe("conditional attach definition contract", () => {
  it("accepts an informational trigger and exactly one governed reward", () => {
    const { service, repository } = fixture(); const input = draft(); service.createDraft(input);
    expect(repository.createDraft).toHaveBeenCalledWith(input);
  });
  it.each([0, -1, 1.5, 10000, null])("rejects invalid trigger quantity %s", (quantity) => {
    const { service, repository } = fixture(); const input = draft(); input.items[0].requiredTriggerQuantity = quantity;
    expect(() => service.createDraft(input)).toThrow(); expect(repository.createDraft).not.toHaveBeenCalled();
  });
  it("rejects missing/multiple rewards, no triggers and shared trigger/reward SKU", () => {
    const { service } = fixture();
    const noReward = draft(); noReward.items.pop(); expect(() => service.createDraft(noReward)).toThrow();
    const noTrigger = draft(); noTrigger.items.shift(); expect(() => service.createDraft(noTrigger)).toThrow();
    const multiple = draft(); multiple.items.push({ ...multiple.items[1], productId: "d" }); expect(() => service.createDraft(multiple)).toThrow();
    const duplicate = draft(); duplicate.items[1].productId = "a"; expect(() => service.createDraft(duplicate)).toThrow();
  });
  it("rejects trigger pricing benefits, reward without PROMO and mixed mechanic fields", () => {
    const { service } = fixture();
    const discounted = draft(); discounted.items[0].benefitType = "existing_price_profile"; discounted.items[0].governedBenefitReference = SPECIAL_OFFERS_PROMO_PROFILE.externalRef;
    expect(() => service.createDraft(discounted)).toThrow();
    const reward = draft(); reward.items[1].benefitType = "informational_only"; reward.items[1].governedBenefitReference = null;
    expect(() => service.createDraft(reward)).toThrow();
    const mixed = draft(); mixed.items[0].requiredBundleQuantity = 4; expect(() => service.createDraft(mixed)).toThrow();
    const threshold = draft(); threshold.items[0].promoThresholdQuantity = 4; expect(() => service.createDraft(threshold)).toThrow();
    const cap = draft(); cap.items[0].maximumQuantityPerCompany = 3; expect(() => service.createDraft(cap)).toThrow();
  });
  it("uses the server workspace for reward intent", async () => {
    const { service, repository } = fixture(); await service.addToCart("actor", "reward", 1, "request");
    expect(repository.addToCart).toHaveBeenCalledWith({ companyId: "trusted-company", campaignItemId: "reward", quantity: 1, requestId: "request" });
  });
});

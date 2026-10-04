import { describe, expect, it, vi } from "vitest";
import type { CommercialCampaignRepository } from "../../repositories";
import type { CampaignDraftInput } from "../../types";
import { SPECIAL_OFFERS_PROMO_PROFILE } from "../../promo-profile";
import { isSpendThresholdValid } from "../../spend-config";
import { CommercialCampaignService } from "../commercial-campaign.service";

function draft(): CampaignDraftInput {
  return { contractVersion: "3", requestId: "request", code: "SPEND", name: "Spend", partnerTitle: "Spend",
    partnerDescription: "A governed reward for scoped USD spend", termsSummary: "1500 USD unlocks reward PROMO", campaignType: "product_offer",
    startsAt: "2026-10-04T10:00:00Z", endsAt: "2026-10-10T10:00:00Z", priority: 1, mechanicType: "spend_threshold_promo",
    spendConfig: { thresholdAmountUsd: "1500.00", currency: "USD", qualifyingProductIds: ["a", "b"], rewardProductId: "c" },
    audienceMode: "explicit_company", companyIds: ["company"], items: ["a", "b", "c"].map((productId, sortOrder) => ({ productId, sortOrder,
      minimumQuantity: 1, maximumQuantityPerCompany: null, benefitType: sortOrder === 2 ? "existing_price_profile" : "informational_only",
      governedBenefitReference: sortOrder === 2 ? SPECIAL_OFFERS_PROMO_PROFILE.externalRef : null, partnerMessage: null,
      promoThresholdQuantity: null })) };
}
function fixture() {
  const repository = { createDraft: vi.fn(), addToCart: vi.fn() };
  const service = new CommercialCampaignService(repository as unknown as CommercialCampaignRepository,
    { getWorkspaceContext: vi.fn().mockResolvedValue({ accessState: "active", companyId: "trusted-company" }) } as never);
  return { repository, service };
}
describe("scoped spend draft boundary", () => {
  it.each(["0", "-1", "1500.001", "NaN", "Infinity", "1e3", "1000000000000", 1500, null])("rejects unsafe threshold %s", (value) => {
    expect(isSpendThresholdValid(value)).toBe(false);
  });
  it.each(["0.01", "1499.99", "1500.00", "1500.01", "999999999999.99"])("preserves valid decimal threshold %s", (value) => {
    expect(isSpendThresholdValid(value)).toBe(true);
  });
  it("accepts separate typed qualifying scope without requiring qualifying PROMO", () => {
    const { service, repository } = fixture(); const input = draft(); service.createDraft(input);
    expect(repository.createDraft).toHaveBeenCalledWith(input);
  });
  it.each(["no_qualifiers", "no_reward", "overlap", "duplicate", "duplicate_item", "foreign_scope", "missing_config", "mixed_fields", "qualifier_benefit", "reward_no_promo"])("rejects %s before persistence", (failure) => {
    const { service, repository } = fixture(); const input = draft();
    if (failure === "no_qualifiers") input.spendConfig!.qualifyingProductIds = [];
    if (failure === "no_reward") input.spendConfig!.rewardProductId = "";
    if (failure === "overlap") input.spendConfig!.rewardProductId = "a";
    if (failure === "duplicate") input.spendConfig!.qualifyingProductIds = ["a", "a"];
    if (failure === "duplicate_item") input.items[1] = { ...input.items[0] };
    if (failure === "foreign_scope") input.spendConfig!.qualifyingProductIds = ["a", "x"];
    if (failure === "missing_config") input.spendConfig = null;
    if (failure === "mixed_fields") input.items[0].promoThresholdQuantity = 2;
    if (failure === "qualifier_benefit") { input.items[0].benefitType = "existing_price_profile"; input.items[0].governedBenefitReference = SPECIAL_OFFERS_PROMO_PROFILE.externalRef; }
    if (failure === "reward_no_promo") { input.items[2].benefitType = "informational_only"; input.items[2].governedBenefitReference = null; }
    expect(() => service.createDraft(input)).toThrow(); expect(repository.createDraft).not.toHaveBeenCalled();
  });
  it("rejects leftover spend config after changing mechanic", () => {
    const { service } = fixture(); const input = draft(); input.mechanicType = "legacy_promo";
    expect(() => service.createDraft(input)).toThrow();
  });
  it("resolves company server-side; reward intent carries no spend or effective price", async () => {
    const { service, repository } = fixture(); await service.addToCart("actor", "reward", 1, "request");
    expect(repository.addToCart).toHaveBeenCalledWith({ companyId: "trusted-company", campaignItemId: "reward", quantity: 1, requestId: "request" });
  });
});

import { describe, expect, it } from "vitest";

import { CAMPAIGN_DRAFT_CONTRACT_VERSION, validateCampaignDraft } from "../../campaign-draft.contract";
import type { CampaignDraftInput } from "../../types";

describe("campaign draft contract", () => {
  it("accepts one fully governed draft", () => {
    expect(validateCampaignDraft(validDraft())).toEqual([]);
  });

  it("returns step and focus metadata for every blocking field", () => {
    const issues = validateCampaignDraft({ ...validDraft(), code: "", name: "", startsAt: "", endsAt: "", items: [], companyIds: [] });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CAMPAIGN_CODE_REQUIRED", step: 0, focusTarget: "campaign-code" }),
      expect.objectContaining({ code: "CAMPAIGN_NAME_REQUIRED", step: 0, focusTarget: "campaign-name" }),
      expect.objectContaining({ code: "CAMPAIGN_PRODUCTS_REQUIRED", step: 1, focusTarget: "campaign-product-search" }),
      expect.objectContaining({ code: "CAMPAIGN_AUDIENCE_REQUIRED", step: 2, focusTarget: "campaign-audience" }),
    ]));
  });

  it("rejects invalid minimum and campaign limit immediately", () => {
    const product = validDraft().items[0];
    expect(validateCampaignDraft({ ...validDraft(), items: [{ ...product, minimumQuantity: 3, maximumQuantityPerCompany: 2 }] }))
      .toContainEqual(expect.objectContaining({ code: "CAMPAIGN_PRODUCT_LIMIT_INVALID", step: 1 }));
  });

  it("keeps a governed non-explicit audience valid without browser-supplied companies", () => {
    expect(validateCampaignDraft({ ...validDraft(), audienceMode: "momentum_attention", companyIds: [] })).toEqual([]);
  });

  it("accepts 1, 10 and 50 products and blocks the 51st", () => {
    for (const count of [1, 10, 50]) {
      const items = Array.from({ length: count }, (_, index) => ({
        ...validDraft().items[0],
        productId: `${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`,
        sortOrder: index + 1,
      }));
      expect(validateCampaignDraft({ ...validDraft(), items }).some((issue) => issue.code === "CAMPAIGN_PRODUCTS_LIMIT_EXCEEDED")).toBe(false);
    }
    const tooMany = Array.from({ length: 51 }, (_, index) => ({ ...validDraft().items[0], productId: `product-${index}`, sortOrder: index + 1 }));
    expect(validateCampaignDraft({ ...validDraft(), items: tooMany })).toContainEqual(expect.objectContaining({ code: "CAMPAIGN_PRODUCTS_LIMIT_EXCEEDED" }));
  });
});

function validDraft(): CampaignDraftInput {
  return {
    contractVersion: CAMPAIGN_DRAFT_CONTRACT_VERSION,
    requestId: "11111111-1111-4111-8111-111111111111",
    code: "AIR_SHIELD_2026", name: "Dahua Air Shield", partnerTitle: "Всегда готов к защите",
    partnerDescription: "Управляемая кампания для партнёров Novotech.", campaignType: "product_offer",
    startsAt: "2026-09-25T10:00:00.000Z", endsAt: "2026-10-25T10:00:00.000Z",
    priority: 100, imageAssetPath: "/images/campaigns/air-shield.webp", termsSummary: "Действуют текущие цены и остатки.",
    audienceMode: "explicit_company", companyIds: ["22222222-2222-4222-8222-222222222222"],
    items: [{ productId: "33333333-3333-4333-8333-333333333333", sortOrder: 1, minimumQuantity: 1, maximumQuantityPerCompany: 5, benefitType: "informational_only", governedBenefitReference: null, partnerMessage: null }],
  };
}

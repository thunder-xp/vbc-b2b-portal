import { describe, expect, it } from "vitest";
import { configureCampaignItemMechanic, isCampaignRequiredQuantityValid } from "../../campaign-draft-mechanics";
import { SPECIAL_OFFERS_PROMO_PROFILE } from "../../promo-profile";
import type { CampaignDraftInput, CampaignMechanicType } from "../../types";

const mechanics: CampaignMechanicType[] = ["legacy_promo", "quantity_threshold_promo", "fixed_bundle_promo", "conditional_attach_promo"];
const item: CampaignDraftInput["items"][number] = {
  productId: "camera", sortOrder: 2, minimumQuantity: 1, maximumQuantityPerCompany: 10,
  benefitType: "existing_price_profile", governedBenefitReference: SPECIAL_OFFERS_PROMO_PROFILE.externalRef,
  partnerMessage: "Existing commercial copy", promoThresholdQuantity: null, requiredBundleQuantity: null,
  attachRole: null, requiredTriggerQuantity: null,
};

describe("shared campaign draft contract", () => {
  it.each([null, undefined, 0, -1, 1.5, 10000, NaN])("rejects invalid required quantity %s", (quantity) => {
    expect(isCampaignRequiredQuantityValid(quantity)).toBe(false);
  });
  it("keeps minimum, cap and whole-unit boundaries consistent", () => {
    expect(isCampaignRequiredQuantityValid(2, 3, 10)).toBe(false);
    expect(isCampaignRequiredQuantityValid(4, 3, 3)).toBe(false);
    expect(isCampaignRequiredQuantityValid(3, 3, 3)).toBe(true);
    expect(isCampaignRequiredQuantityValid(9999)).toBe(true);
    // Quantity threshold remains independent of the item's purchase minimum.
    expect(isCampaignRequiredQuantityValid(1, 1, 10)).toBe(true);
  });
  for (const from of mechanics) {
    it.each(mechanics)(`${from} → %s removes inactive configuration`, (to) => {
      const configured = configureCampaignItemMechanic(item, from);
      if (from === "quantity_threshold_promo") configured.promoThresholdQuantity = 4;
      if (from === "fixed_bundle_promo") configured.requiredBundleQuantity = 4;
      if (from === "conditional_attach_promo") configured.requiredTriggerQuantity = 4;
      const next = configureCampaignItemMechanic(configured, to);
      if (to !== "quantity_threshold_promo") expect(next.promoThresholdQuantity).toBeNull();
      if (to !== "fixed_bundle_promo") expect(next.requiredBundleQuantity).toBeNull();
      if (to !== "conditional_attach_promo") {
        expect(next.attachRole).toBeNull(); expect(next.requiredTriggerQuantity).toBeNull();
      } else {
        expect(next.attachRole).toBe("TRIGGER"); expect(next.requiredTriggerQuantity).toBeNull();
        expect(next.benefitType).toBe("informational_only"); expect(next.governedBenefitReference).toBeNull();
      }
      expect(next.maximumQuantityPerCompany).toBe(10);
      expect(next.productId).toBe(item.productId); expect(next.partnerMessage).toBe(item.partnerMessage);
      expect(configured).not.toBe(next);
    });
  }
  it("preserves an existing legacy PROMO choice and same-mechanic required quantity", () => {
    expect(configureCampaignItemMechanic(item, "legacy_promo").governedBenefitReference).toBe(SPECIAL_OFFERS_PROMO_PROFILE.externalRef);
    expect(configureCampaignItemMechanic({ ...item, promoThresholdQuantity: 4 }, "quantity_threshold_promo").promoThresholdQuantity).toBe(4);
    expect(configureCampaignItemMechanic({ ...item, requiredBundleQuantity: 4 }, "fixed_bundle_promo").requiredBundleQuantity).toBe(4);
  });
});

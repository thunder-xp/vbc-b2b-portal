import { SPECIAL_OFFERS_PROMO_PROFILE } from "./promo-profile";
import type { CampaignDraftInput, CampaignMechanicType } from "./types";

type DraftItem = CampaignDraftInput["items"][number];

/** Draft contract only. Published eligibility and selling prices remain SQL-owned. */
export function isCampaignRequiredQuantityValid(
  quantity: number | null | undefined,
  minimumQuantity = 1,
  maximumQuantityPerCompany: number | null = null,
): boolean {
  return Number.isInteger(quantity) && Number(quantity) >= Math.max(1, minimumQuantity)
    && Number(quantity) <= 9999
    && (maximumQuantityPerCompany === null || maximumQuantityPerCompany >= Number(quantity));
}

/** Clear inactive mechanic fields while preserving the existing editor transition policy. */
export function configureCampaignItemMechanic<T extends DraftItem>(item: T, mechanic: CampaignMechanicType): T {
  if (mechanic === "bundle_special_price") return { ...item, minimumQuantity: 1, attachRole: null, requiredTriggerQuantity: null, benefitType: "informational_only", governedBenefitReference: null, promoThresholdQuantity: null, requiredBundleQuantity: item.requiredBundleQuantity ?? null, bundleSpecialUnitPrice: item.bundleSpecialUnitPrice ?? null, bundleSpecialCurrency: item.bundleSpecialCurrency ?? "USD" };
  item = { ...item, bundleSpecialUnitPrice: null, bundleSpecialCurrency: null };
  if (mechanic === "spend_threshold_promo") {
    return { ...item, minimumQuantity: 1, attachRole: null, requiredTriggerQuantity: null,
      benefitType: "informational_only", governedBenefitReference: null,
      promoThresholdQuantity: null, requiredBundleQuantity: null };
  }
  if (mechanic === "conditional_attach_promo") {
    return { ...item, minimumQuantity: 1, attachRole: "TRIGGER", requiredTriggerQuantity: null,
      benefitType: "informational_only", governedBenefitReference: null,
      promoThresholdQuantity: null, requiredBundleQuantity: null };
  }
  if (mechanic === "quantity_threshold_promo" || mechanic === "fixed_bundle_promo") {
    return { ...item, minimumQuantity: 1, attachRole: null, requiredTriggerQuantity: null,
      benefitType: "existing_price_profile", governedBenefitReference: SPECIAL_OFFERS_PROMO_PROFILE.externalRef,
      promoThresholdQuantity: mechanic === "quantity_threshold_promo" ? item.promoThresholdQuantity : null,
      requiredBundleQuantity: mechanic === "fixed_bundle_promo" ? item.requiredBundleQuantity : null };
  }
  return { ...item, attachRole: null, requiredTriggerQuantity: null,
    promoThresholdQuantity: null, requiredBundleQuantity: null };
}

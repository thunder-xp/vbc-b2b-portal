import type { CampaignMechanicType, CampaignPromoEligibilityReason, CampaignStatus } from "../types";

export type QuantityThresholdPromoEligibilityInput = {
  mechanicType: CampaignMechanicType;
  campaignStatus: CampaignStatus;
  startsAt: string;
  endsAt: string;
  audienceIncluded: boolean;
  productIncluded: boolean;
  quantity: number;
  thresholdQuantity: number | null;
  governedPromoAvailable: boolean;
  evaluatedAt?: Date;
};

export type QuantityThresholdPromoEligibility = {
  eligible: boolean;
  reason: CampaignPromoEligibilityReason;
  thresholdQuantity: number | null;
  remainingQuantity: number;
};

/**
 * Pure domain mirror used for deterministic presentation/tests. Database RPCs
 * remain authoritative for every cart mutation and publication decision.
 */
export function evaluateQuantityThresholdPromoEligibility(
  input: QuantityThresholdPromoEligibilityInput,
): QuantityThresholdPromoEligibility {
  const threshold = input.thresholdQuantity;
  if (input.mechanicType !== "quantity_threshold_promo") {
    return result(false, "legacy_campaign", threshold, 0);
  }
  if (!Number.isInteger(threshold) || Number(threshold) < 1 || Number(threshold) > 9999) {
    return result(false, "invalid_threshold", threshold, 0);
  }
  if (input.campaignStatus !== "active") {
    return result(false, "inactive_campaign", threshold, remaining(input.quantity, threshold));
  }
  const evaluatedAt = input.evaluatedAt ?? new Date();
  const startsAt = Date.parse(input.startsAt);
  const endsAt = Date.parse(input.endsAt);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || evaluatedAt.getTime() < startsAt || evaluatedAt.getTime() >= endsAt) {
    return result(false, "outside_period", threshold, remaining(input.quantity, threshold));
  }
  if (!input.audienceIncluded) {
    return result(false, "outside_audience", threshold, remaining(input.quantity, threshold));
  }
  if (!input.productIncluded) {
    return result(false, "product_not_in_scope", threshold, remaining(input.quantity, threshold));
  }
  if (!input.governedPromoAvailable) {
    return result(false, "missing_promo", threshold, 0);
  }
  if (!Number.isInteger(input.quantity) || input.quantity < Number(threshold)) {
    return result(false, "below_threshold", threshold, remaining(input.quantity, threshold));
  }
  return result(true, "eligible", threshold, 0);
}

function remaining(quantity: number, threshold: number | null): number {
  if (!Number.isInteger(threshold) || Number(threshold) < 1) return 0;
  return Math.max(0, Number(threshold) - (Number.isInteger(quantity) ? quantity : 0));
}

function result(
  eligible: boolean,
  reason: CampaignPromoEligibilityReason,
  thresholdQuantity: number | null,
  remainingQuantity: number,
): QuantityThresholdPromoEligibility {
  return { eligible, reason, thresholdQuantity, remainingQuantity };
}

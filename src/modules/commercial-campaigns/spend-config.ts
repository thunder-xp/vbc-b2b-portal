import Decimal from "decimal.js";
import type { CampaignDraftInput, SpendThresholdPromoConfig } from "./types";

/** Draft validation only. Published spend and eligibility are PostgreSQL numeric-owned. */
export function isSpendThresholdValid(value: unknown): value is string {
  if (typeof value !== "string" || !/^[0-9]{1,12}(\.[0-9]{1,2})?$/.test(value)) return false;
  const amount = new Decimal(value);
  return amount.isFinite() && amount.greaterThan(0) && amount.lessThan("1000000000000");
}

export function isSpendConfigValid(config: SpendThresholdPromoConfig | null | undefined, items: CampaignDraftInput["items"]): boolean {
  if (!config || config.currency !== "USD" || !isSpendThresholdValid(config.thresholdAmountUsd)
    || !Array.isArray(config.qualifyingProductIds) || !config.qualifyingProductIds.length || !config.rewardProductId
    || config.qualifyingProductIds.includes(config.rewardProductId)) return false;
  const scope = new Set([...config.qualifyingProductIds, config.rewardProductId]);
  return scope.size === items.length && new Set(items.map((item) => item.productId)).size === items.length
    && scope.size === config.qualifyingProductIds.length + 1
    && items.every((item) => scope.has(item.productId) && item.promoThresholdQuantity == null
      && item.requiredBundleQuantity == null && item.attachRole == null && item.requiredTriggerQuantity == null
      && (item.productId === config.rewardProductId ? item.benefitType === "existing_price_profile"
        : item.benefitType === "informational_only"));
}

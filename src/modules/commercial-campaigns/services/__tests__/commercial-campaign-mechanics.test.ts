import { describe, expect, it } from "vitest";

import { evaluateQuantityThresholdPromoEligibility } from "../commercial-campaign-mechanics";

const base = {
  mechanicType: "quantity_threshold_promo" as const,
  campaignStatus: "active" as const,
  startsAt: "2026-10-01T00:00:00.000Z",
  endsAt: "2026-11-01T00:00:00.000Z",
  audienceIncluded: true,
  productIncluded: true,
  quantity: 5,
  thresholdQuantity: 5,
  governedPromoAvailable: true,
  evaluatedAt: new Date("2026-10-10T12:00:00.000Z"),
};

describe("QUANTITY_THRESHOLD_PROMO eligibility", () => {
  it("keeps Partner pricing below the threshold", () => {
    expect(evaluateQuantityThresholdPromoEligibility({ ...base, quantity: 4 })).toEqual({ eligible: false, reason: "below_threshold", thresholdQuantity: 5, remainingQuantity: 1 });
  });

  it.each([5, 6])("unlocks governed PROMO at and above the threshold (%s)", (quantity) => {
    expect(evaluateQuantityThresholdPromoEligibility({ ...base, quantity })).toMatchObject({ eligible: true, reason: "eligible", remainingQuantity: 0 });
  });

  it("fails closed when governed PROMO is unavailable", () => {
    expect(evaluateQuantityThresholdPromoEligibility({ ...base, governedPromoAvailable: false })).toMatchObject({ eligible: false, reason: "missing_promo" });
  });

  it.each([null, 0, 1.5, 10000])("rejects an invalid threshold (%s)", (thresholdQuantity) => {
    expect(evaluateQuantityThresholdPromoEligibility({ ...base, thresholdQuantity })).toMatchObject({ eligible: false, reason: "invalid_threshold" });
  });

  it("rejects inactive campaigns", () => {
    expect(evaluateQuantityThresholdPromoEligibility({ ...base, campaignStatus: "paused" })).toMatchObject({ eligible: false, reason: "inactive_campaign" });
  });

  it("rejects evaluation outside the campaign period", () => {
    expect(evaluateQuantityThresholdPromoEligibility({ ...base, evaluatedAt: new Date("2026-11-01T00:00:00.000Z") })).toMatchObject({ eligible: false, reason: "outside_period" });
  });

  it("rejects a Partner outside the audience", () => {
    expect(evaluateQuantityThresholdPromoEligibility({ ...base, audienceIncluded: false })).toMatchObject({ eligible: false, reason: "outside_audience" });
  });

  it("rejects a product outside campaign scope", () => {
    expect(evaluateQuantityThresholdPromoEligibility({ ...base, productIncluded: false })).toMatchObject({ eligible: false, reason: "product_not_in_scope" });
  });

  it("does not reinterpret legacy campaigns", () => {
    expect(evaluateQuantityThresholdPromoEligibility({ ...base, mechanicType: "legacy_promo" })).toMatchObject({ eligible: false, reason: "legacy_campaign" });
  });
});

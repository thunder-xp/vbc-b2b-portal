import { describe, expect, it } from "vitest";

import {
  buildProductCompetitorPricing,
  isPossibleOrderOfMagnitudeOutlier,
  normalizeCompetitorName,
  resolveCompetitiveConfidence,
  STRONG_RECOMMENDATION_MIN_COMPANIES,
  STRONG_RECOMMENDATION_MIN_OBSERVATIONS,
} from "../service";
import { projectPartnerProductCompetitiveIntelligence } from "../partner-product-comparison";
import type { ProductCompetitorPricingItem } from "../types";

describe("competitive intelligence rules", () => {
  it("normalizes governed competitor aliases without fuzzy identity guessing", () => {
    expect(normalizeCompetitorName(" Exterior Security, SRL ")).toBe("exteriorsecuritysrl");
    expect(normalizeCompetitorName("Exterior Security")).not.toBe(normalizeCompetitorName("Exterior Systems"));
  });

  it("derives confidence deterministically from source and evidence", () => {
    expect(resolveCompetitiveConfidence("verbal", false)).toBe("low");
    expect(resolveCompetitiveConfidence("message", false)).toBe("medium");
    expect(resolveCompetitiveConfidence("quotation", true)).toBe("high");
  });

  it("flags only order-of-magnitude deviations through the pure guard", () => {
    expect(isPossibleOrderOfMagnitudeOutlier(1001, 100)).toBe(true);
    expect(isPossibleOrderOfMagnitudeOutlier(9, 100)).toBe(true);
    expect(isPossibleOrderOfMagnitudeOutlier(500, 100)).toBe(false);
    expect(isPossibleOrderOfMagnitudeOutlier(100, null)).toBe(false);
  });

  it("centralizes the minimum strong recommendation sample", () => {
    expect(STRONG_RECOMMENDATION_MIN_COMPANIES).toBe(3);
    expect(STRONG_RECOMMENDATION_MIN_OBSERVATIONS).toBe(5);
  });

  it("renders only the database-governed comparison result without FX or client recomputation", () => {
    const [item] = buildProductCompetitorPricing(read({
      comparisonStatus: "vat_unknown",
      novotechDifferenceAmount: null,
      novotechDifferencePercent: null,
    }));
    expect(item).toMatchObject({
      comparisonStatus: "vat_unknown",
      novotechDifferenceAmount: null,
      novotechDifferencePercent: null,
    });
  });

  it("preserves fail-closed historical truth without presentation reclassification", () => {
    const read = {
      canManage: true,
      windowDays: 30 as const,
      competitors: [],
      summary: { observationCount: 1, latestDate: "2026-08-31", latestCompetitorPrice: 58, latestCurrency: "USD", latestNovotechPrice: 49.06, latestNovotechCurrency: "USD", latestDeltaAmount: null, latestDeltaPercent: null },
      observations: [{ id: "observation-1", date: "2026-08-31", competitorName: "Exterior", price: 58, currency: "USD", vatMode: "included" as const, quantity: 1, quantityCohort: "single" as const, sourceType: "verbal" as const, confidence: "low" as const, possibleOutlier: false, novotechPrice: 49.06, novotechCurrency: "USD", comparisonBasis: "partner_price" as const, comparisonStatus: "vat_not_comparable" as const, deltaAmount: null, deltaPercent: null, hasEvidence: false, evidenceId: null, supersedesObservationId: null, isSuperseded: false, createdAt: "2026-08-31T10:00:00Z" }],
    };

    const projected = projectPartnerProductCompetitiveIntelligence(read);
    expect(projected.summary).toMatchObject({ latestDeltaAmount: null, latestDeltaPercent: null });
    expect(projected.observations[0]).toMatchObject({ price: 58, novotechPrice: 49.06, comparisonStatus: "vat_not_comparable", deltaAmount: null, deltaPercent: null });
    expect(read.observations[0]).toMatchObject({ comparisonStatus: "vat_not_comparable", deltaAmount: null, deltaPercent: null });
  });
});

function read(overrides: Partial<ProductCompetitorPricingItem> = {}) {
  return {
    items: [{ ...item(), ...overrides }],
  };
}
function item(): ProductCompetitorPricingItem {
  return {
    competitorId: "competitor-1", competitorName: "Exterior", retailPrice: 1777,
    retailCurrency: "MDL", retailEffectiveDate: "2026-08-08", ownPrice: 1590,
    ownCurrency: "MDL", ownObservationDate: "2026-08-20", ownQuantity: 10,
    retailDiscountAmount: null, retailDiscountPercent: null, retailComparisonStatus: "incompatible_price_basis",
    novotechPrice: 836, novotechCurrency: "MDL", novotechDifferenceAmount: 754,
    novotechDifferencePercent: 47.4214, comparisonStatus: "comparable",
  };
}

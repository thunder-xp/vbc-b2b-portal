import { describe, expect, it } from "vitest";

import {
  buildProductCompetitorPricing,
  isPossibleOrderOfMagnitudeOutlier,
  normalizeCompetitorName,
  resolveCompetitiveConfidence,
  STRONG_RECOMMENDATION_MIN_COMPANIES,
  STRONG_RECOMMENDATION_MIN_OBSERVATIONS,
} from "../service";
import { compareHistoricalPartnerPrices, projectPartnerProductCompetitiveIntelligence } from "../partner-product-comparison";

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

  it("calculates retail discount and positive Novotech benefit centrally", () => {
    const [item] = buildProductCompetitorPricing(read({ retailPrice: 1777, ownPrice: 1590 }), commercial(836));
    expect(item).toMatchObject({
      retailDiscountAmount: 187,
      retailDiscountPercent: 10.5234,
      novotechPrice: 836,
      novotechDifferenceAmount: 754,
      novotechDifferencePercent: 47.4214,
      comparisonStatus: "comparable",
      ownQuantity: 10,
    });
  });

  it("keeps an unfavorable Novotech difference negative", () => {
    const [item] = buildProductCompetitorPricing(read({ retailPrice: 1000, ownPrice: 800 }), commercial(836));
    expect(item.novotechDifferenceAmount).toBe(-36);
    expect(item.novotechDifferencePercent).toBe(-4.5);
  });

  it("uses governed FX only and refuses an unsupported currency comparison", () => {
    const [converted] = buildProductCompetitorPricing(read({ retailPrice: 100, retailCurrency: "USD", ownPrice: 1590 }), commercial(836));
    expect(converted.retailDiscountAmount).toBe(187);
    const [unsupported] = buildProductCompetitorPricing(read({ retailPrice: 100, retailCurrency: "EUR", ownPrice: 1590 }), commercial(836));
    expect(unsupported.retailDiscountAmount).toBeNull();
    expect(unsupported.retailDiscountPercent).toBeNull();
  });

  it("calculates the historical Novotech benefit from immutable same-currency snapshots", () => {
    expect(compareHistoricalPartnerPrices({
      competitorPrice: 58,
      competitorCurrency: "USD",
      novotechPrice: 49.06,
      novotechCurrency: "USD",
    })).toEqual({ status: "comparable", deltaAmount: 8.94, deltaPercent: 15.4138 });
  });

  it("keeps an unfavorable historical comparison negative", () => {
    expect(compareHistoricalPartnerPrices({
      competitorPrice: 49.06,
      competitorCurrency: "USD",
      novotechPrice: 58,
      novotechCurrency: "USD",
    })).toEqual({ status: "comparable", deltaAmount: -8.94, deltaPercent: -18.2226 });
  });

  it("fails closed for currency mismatch or missing historical snapshots", () => {
    expect(compareHistoricalPartnerPrices({ competitorPrice: 58, competitorCurrency: "USD", novotechPrice: 900, novotechCurrency: "MDL" }))
      .toEqual({ status: "currency_mismatch", deltaAmount: null, deltaPercent: null });
    expect(compareHistoricalPartnerPrices({ competitorPrice: 58, competitorCurrency: "USD", novotechPrice: null, novotechCurrency: null }))
      .toEqual({ status: "price_unavailable", deltaAmount: null, deltaPercent: null });
  });

  it("repairs the legacy empty-delta read projection without mutating snapshot prices", () => {
    const read = {
      canManage: true,
      windowDays: 30 as const,
      competitors: [],
      summary: { observationCount: 1, latestDate: "2026-08-31", latestCompetitorPrice: 58, latestCurrency: "USD", latestNovotechPrice: 49.06, latestNovotechCurrency: "USD", latestDeltaAmount: null, latestDeltaPercent: null },
      observations: [{ id: "observation-1", date: "2026-08-31", competitorName: "Exterior", price: 58, currency: "USD", vatMode: "included" as const, quantity: 1, quantityCohort: "single" as const, sourceType: "verbal" as const, confidence: "low" as const, possibleOutlier: false, novotechPrice: 49.06, novotechCurrency: "USD", comparisonBasis: "partner_price" as const, comparisonStatus: "vat_not_comparable" as const, deltaAmount: null, deltaPercent: null, hasEvidence: false, evidenceId: null, supersedesObservationId: null, isSuperseded: false, createdAt: "2026-08-31T10:00:00Z" }],
    };

    const projected = projectPartnerProductCompetitiveIntelligence(read);
    expect(projected.summary).toMatchObject({ latestDeltaAmount: 8.94, latestDeltaPercent: 15.4138 });
    expect(projected.observations[0]).toMatchObject({ price: 58, novotechPrice: 49.06, comparisonStatus: "comparable", deltaAmount: 8.94, deltaPercent: 15.4138 });
    expect(read.observations[0]).toMatchObject({ comparisonStatus: "vat_not_comparable", deltaAmount: null, deltaPercent: null });
  });
});

function read(overrides: { retailPrice: number; retailCurrency?: string; ownPrice: number | null }) {
  return {
    items: [{ competitorId: "competitor-1", competitorName: "Exterior", retailPrice: overrides.retailPrice,
      retailCurrency: overrides.retailCurrency ?? "MDL", retailEffectiveDate: "2026-08-08", ownPrice: overrides.ownPrice,
      ownCurrency: overrides.ownPrice === null ? null : "MDL", ownObservationDate: "2026-08-20", ownQuantity: 10 }],
    rates: { partnerUsdMdl: 17.77, retailUsdMdl: 17.77, effectiveDate: "2026-08-25" },
  };
}
function commercial(amount: number) {
  return { partnerPriceMdl: { amount, currencyCode: "MDL", formattedAmount: `${amount} MDL`, lastUpdatedAt: "2026-08-25T00:00:00Z" } } as never;
}

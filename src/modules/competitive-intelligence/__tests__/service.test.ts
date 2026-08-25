import { describe, expect, it } from "vitest";

import {
  buildProductCompetitorPricing,
  isPossibleOrderOfMagnitudeOutlier,
  normalizeCompetitorName,
  resolveCompetitiveConfidence,
  STRONG_RECOMMENDATION_MIN_COMPANIES,
  STRONG_RECOMMENDATION_MIN_OBSERVATIONS,
} from "../service";

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

import { describe, expect, it } from "vitest";

import {
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
});

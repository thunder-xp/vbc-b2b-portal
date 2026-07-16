import { describe, expect, it } from "vitest";

import {
  calculateCommercialLine,
  calculateEstimateCommercials,
  convertMoney,
  EstimateCalculationError,
  resolveCurrencyRate,
} from "../commercial-calculation";

const directLine = {
  id: "line-1",
  sectionId: "section-1",
  quantity: 2,
  pricingMode: "direct" as const,
  pricingInputValue: 100,
  convertedCostUnitPrice: 80,
  lineDiscountPercent: 10,
};

describe("estimate commercial calculation", () => {
  it("supports direct, markup, and target-margin modes with one authoritative input", () => {
    expect(calculateCommercialLine(directLine)).toMatchObject({ sellingUnitPrice: 100, lineSubtotal: 200, lineDiscountAmount: 20, lineTotal: 180, markupPercent: 25, marginPercent: 20 });
    expect(calculateCommercialLine({ ...directLine, pricingMode: "markup", pricingInputValue: 25, lineDiscountPercent: 0 })).toMatchObject({ sellingUnitPrice: 100, markupPercent: 25, marginPercent: 20 });
    expect(calculateCommercialLine({ ...directLine, pricingMode: "margin", pricingInputValue: 20, lineDiscountPercent: 0 })).toMatchObject({ sellingUnitPrice: 100, markupPercent: 25, marginPercent: 20 });
  });

  it("allows direct pricing without cost but blocks cost-derived modes", () => {
    expect(calculateCommercialLine({ ...directLine, convertedCostUnitPrice: null })).toMatchObject({ sellingUnitPrice: 100, markupPercent: null, marginPercent: null });
    expect(() => calculateCommercialLine({ ...directLine, pricingMode: "markup", convertedCostUnitPrice: 0 })).toThrowError(EstimateCalculationError);
    expect(() => calculateCommercialLine({ ...directLine, pricingMode: "margin", pricingInputValue: 100 })).toThrowError(EstimateCalculationError);
  });

  it("applies line, section, global discounts, charges, then separate VAT", () => {
    const result = calculateEstimateCommercials({
      lines: [directLine],
      sections: [{ id: "section-1", discountPercent: 10 }],
      charges: [{ amount: 20, vatApplicable: true }],
      globalDiscountPercent: 10,
      vatMode: "separate",
      vatRatePercent: 20,
    });
    expect(result).toMatchObject({
      subtotal: 200,
      lineDiscountTotal: 20,
      sectionDiscountTotal: 18,
      globalSubtotal: 145.8,
      globalDiscountAmount: 16.2,
      chargesTotal: 20,
      vatBase: 165.8,
      vatAmount: 33.16,
      totalExcludingVat: 165.8,
      finalTotal: 198.96,
    });
  });

  it("handles included, excluded, and hidden VAT without taxing non-taxable charges", () => {
    const input = { lines: [{ ...directLine, quantity: 1, pricingInputValue: 120, convertedCostUnitPrice: 80, lineDiscountPercent: 0 }], sections: [{ id: "section-1", discountPercent: 0 }], charges: [{ amount: 12, vatApplicable: false }], globalDiscountPercent: 0, vatRatePercent: 20 };
    expect(calculateEstimateCommercials({ ...input, vatMode: "included" })).toMatchObject({ vatBase: 120, vatAmount: 20, totalExcludingVat: 112, finalTotal: 132 });
    expect(calculateEstimateCommercials({ ...input, vatMode: "excluded" })).toMatchObject({ vatAmount: 0, totalExcludingVat: 132, finalTotal: 132 });
    expect(calculateEstimateCommercials({ ...input, vatMode: "none" })).toMatchObject({ vatAmount: 0, finalTotal: 132 });
  });

  it("uses deterministic financial rounding", () => {
    expect(calculateCommercialLine({ ...directLine, quantity: 3, pricingInputValue: 10.005, lineDiscountPercent: 0 })).toMatchObject({ sellingUnitPrice: 10.01, lineSubtotal: 30.03 });
  });

  it("converts only supported published currency pairs", () => {
    expect(resolveCurrencyRate("USD", "MDL", 17.56341414)).toBe(17.56341414);
    expect(resolveCurrencyRate("MDL", "USD", 20)).toBe(0.05);
    expect(convertMoney(100, 0.05)).toBe(5);
    expect(() => resolveCurrencyRate("EUR", "MDL", 20)).toThrowError(EstimateCalculationError);
  });

  it("rejects invalid values, percentages, non-finite numbers, and overflow", () => {
    expect(() => calculateCommercialLine({ ...directLine, quantity: 0 })).toThrowError(EstimateCalculationError);
    expect(() => calculateCommercialLine({ ...directLine, pricingInputValue: Number.NaN })).toThrowError(EstimateCalculationError);
    expect(() => calculateCommercialLine({ ...directLine, lineDiscountPercent: 100 })).toThrowError(EstimateCalculationError);
    expect(() => calculateCommercialLine({ ...directLine, pricingInputValue: Number.POSITIVE_INFINITY })).toThrowError(EstimateCalculationError);
    expect(() => calculateCommercialLine({ ...directLine, quantity: 999999, pricingInputValue: 9999999999999999 })).toThrowError(EstimateCalculationError);
  });

  it.each([100, 300])("calculates %i lines within an interactive CPU budget", (count) => {
    const startedAt = performance.now();
    const result = calculateEstimateCommercials({
      lines: Array.from({ length: count }, (_, index) => ({ ...directLine, id: `line-${index}` })),
      sections: [{ id: "section-1", discountPercent: 0 }],
      charges: [], globalDiscountPercent: 0, vatMode: "none", vatRatePercent: 0,
    });
    expect(result.lines).toHaveLength(count);
    expect(performance.now() - startedAt).toBeLessThan(100);
  });
});

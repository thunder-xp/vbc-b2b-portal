import { describe, expect, it } from "vitest";

import type { EstimateLineDto } from "../estimate.service";
import {
  applyBulkDiscount,
  applyBulkMarkup,
  moveBulkLines,
  resetBulkToPartnerPrice,
  updateBulkQuantity,
} from "../estimate-bulk-operations";

const lines = [line("line-1", "product", 80), line("line-2", "service", 20), line("line-3", "custom", null)];

describe("estimate bulk operations", () => {
  it("applies markup only where a reference cost exists", () => {
    const result = applyBulkMarkup(lines, new Set(["line-1", "line-3"]), 25);
    expect(result.changedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.lines[0]).toMatchObject({ pricingMode: "markup", pricingInputValue: 25 });
    expect(result.lines[2]).toMatchObject({ pricingMode: "direct", pricingInputValue: 100 });
  });

  it("applies discounts, section movement, and quantity to the exact selection", () => {
    const selected = new Set(["line-1", "line-2"]);
    expect(applyBulkDiscount(lines, selected, 10).lines.map((item) => item.lineDiscountPercent)).toEqual([10, 10, 0]);
    expect(moveBulkLines(lines, selected, "section-2").lines.map((item) => item.sectionId)).toEqual(["section-2", "section-2", "section-1"]);
    expect(updateBulkQuantity(lines, selected, 3).lines.map((item) => item.quantity)).toEqual([3, 3, 1]);
  });

  it("resets product lines to their current partner-price snapshot", () => {
    const result = resetBulkToPartnerPrice(lines, new Set(["line-1", "line-2"]));
    expect(result.changedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.lines[0]).toMatchObject({ pricingMode: "direct", pricingInputValue: 80, lineDiscountPercent: 0 });
  });
});

function line(id: string, lineType: EstimateLineDto["lineType"], convertedCostUnitPrice: number | null): EstimateLineDto {
  return {
    id, sectionId: "section-1", lineType, productId: lineType === "product" ? id : null, position: 1,
    sku: null, description: id, quantity: 1, unit: "pcs", unitLabel: "шт.", sourcePrice: null,
    sourceCurrencyCode: null, sourceSnapshotAt: null, pricingMode: "direct", pricingInputValue: 100,
    internalCostUnitPrice: null, convertedCostUnitPrice, exchangeRate: null, exchangeRateEffectiveDate: null,
    lineDiscountPercent: 0, markupPercent: null, marginPercent: null, sellingUnitPrice: 100,
    formattedSellingUnitPrice: "$100.00", lineTotal: "$100.00",
  };
}

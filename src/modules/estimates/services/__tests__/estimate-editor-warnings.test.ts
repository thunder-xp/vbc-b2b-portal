import { describe, expect, it } from "vitest";

import type { EstimateLineDto } from "../estimate.service";
import { deriveEstimateEditorWarnings } from "../estimate-editor-warnings";

const product = (patch: Partial<EstimateLineDto> = {}): EstimateLineDto => ({
  id: "line-1", sectionId: "section-1", lineType: "product", productId: "product-1",
  position: 1, sku: "SKU-1", description: "Camera", quantity: 2, unit: "pcs", unitLabel: "шт.",
  pricingMode: "direct", pricingInputValue: 100, lineDiscountPercent: 0, sellingUnitPrice: 100,
  formattedSellingUnitPrice: "$100.00", lineTotal: "$200.00", currentStockStatus: "in_stock",
  currentAvailableQuantity: 5, ...patch,
});

describe("deriveEstimateEditorWarnings", () => {
  it("returns no warning for a healthy quote", () => {
    expect(deriveEstimateEditorWarnings([product()], null)).toEqual([]);
  });

  it("aggregates no-stock and authoritative negative-markup conditions", () => {
    expect(deriveEstimateEditorWarnings([
      product({ currentStockStatus: "out_of_stock", currentAvailableQuantity: 0 }),
      product({ id: "line-2", productId: "product-2", currentStockStatus: "unknown", currentAvailableQuantity: null }),
    ], null, [
      { id: "line-1", markupPercent: -5 },
      { id: "line-2", markupPercent: 10 },
    ])).toEqual([
      { kind: "no_stock", count: 1, lineIds: ["line-1"] },
      { kind: "negative_markup", count: 1, lineIds: ["line-1"] },
    ]);
  });
});

import { describe, expect, it } from "vitest";

import type { EstimateCommercialCheckDto, EstimateLineDto } from "../estimate.service";
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

  it("aggregates server-resolved stock and governed price-check conditions", () => {
    const check = {
      checkedAt: "2026-09-26T10:00:00Z",
      lines: [{ lineId: "line-1", sku: "SKU-1", description: "Camera", oldPrice: 100, currentPrice: 105, currencyCode: "USD", priceChanged: true, currentStock: "1", currentArrival: null }],
    } satisfies EstimateCommercialCheckDto;
    expect(deriveEstimateEditorWarnings([
      product({ currentAvailableQuantity: 1 }),
      product({ id: "line-2", productId: "product-2", currentStockStatus: "unknown", currentAvailableQuantity: null }),
    ], check)).toEqual([
      { kind: "insufficient_stock", count: 1, lineIds: ["line-1"] },
      { kind: "uncertain_stock", count: 1, lineIds: ["line-2"] },
      { kind: "changed_price", count: 1, lineIds: ["line-1"] },
    ]);
  });
});

import type { EstimateCommercialCheckDto, EstimateLineDto } from "./estimate.service";

export type EstimateEditorWarning = {
  kind: "no_stock" | "negative_markup";
  count: number;
  lineIds: string[];
};

/**
 * Aggregates only commercial state already resolved by the estimate service or
 * by the explicit governed price check. It does not reinterpret catalog truth.
 */
export function deriveEstimateEditorWarnings(
  lines: EstimateLineDto[],
  _commercialCheck: EstimateCommercialCheckDto | null,
  calculatedLines: ReadonlyArray<{ id: string; markupPercent: number | null }> = [],
): EstimateEditorWarning[] {
  const products = lines.filter((line) => line.lineType === "product");
  const unavailable = products.filter((line) =>
    line.productUnavailable === true
    || line.currentStockStatus === "out_of_stock",
  );
  const negativeMarkup = calculatedLines.filter(
    (line) => line.markupPercent !== null && line.markupPercent < 0,
  );

  return [
    unavailable.length ? { kind: "no_stock" as const, count: unavailable.length, lineIds: unavailable.map((line) => line.id) } : null,
    negativeMarkup.length ? { kind: "negative_markup" as const, count: negativeMarkup.length, lineIds: negativeMarkup.map((line) => line.id) } : null,
  ].filter((warning): warning is EstimateEditorWarning => warning !== null);
}

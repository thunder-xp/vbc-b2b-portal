import type { EstimateCommercialCheckDto, EstimateLineDto } from "./estimate.service";

export type EstimateEditorWarning = {
  kind: "insufficient_stock" | "uncertain_stock" | "changed_price";
  count: number;
  lineIds: string[];
};

/**
 * Aggregates only commercial state already resolved by the estimate service or
 * by the explicit governed price check. It does not reinterpret catalog truth.
 */
export function deriveEstimateEditorWarnings(
  lines: EstimateLineDto[],
  commercialCheck: EstimateCommercialCheckDto | null,
): EstimateEditorWarning[] {
  const products = lines.filter((line) => line.lineType === "product");
  const insufficient = products.filter((line) =>
    line.productUnavailable === true
    || line.currentStockStatus === "out_of_stock"
    || (line.currentAvailableQuantity !== null
      && line.currentAvailableQuantity !== undefined
      && line.currentAvailableQuantity < line.quantity),
  );
  const insufficientIds = new Set(insufficient.map((line) => line.id));
  const uncertain = products.filter((line) =>
    !insufficientIds.has(line.id)
    && (line.currentStockStatus === "expected"
      || line.currentStockStatus === "unknown"
      || line.currentStockStatus === null
      || line.currentStockStatus === undefined),
  );
  const changed = commercialCheck?.lines.filter((line) => line.priceChanged) ?? [];

  return [
    insufficient.length ? { kind: "insufficient_stock" as const, count: insufficient.length, lineIds: insufficient.map((line) => line.id) } : null,
    uncertain.length ? { kind: "uncertain_stock" as const, count: uncertain.length, lineIds: uncertain.map((line) => line.id) } : null,
    changed.length ? { kind: "changed_price" as const, count: changed.length, lineIds: changed.map((line) => line.lineId) } : null,
  ].filter((warning): warning is EstimateEditorWarning => warning !== null);
}

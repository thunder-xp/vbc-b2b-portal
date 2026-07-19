import type { EstimateLineDto } from "./estimate.service";

export type EstimateBulkResult = {
  lines: EstimateLineDto[];
  changedCount: number;
  skippedCount: number;
};

export function applyBulkMarkup(lines: EstimateLineDto[], selectedIds: ReadonlySet<string>, markupPercent: number): EstimateBulkResult {
  return transformSelected(lines, selectedIds, (line) => line.convertedCostUnitPrice && line.convertedCostUnitPrice > 0
    ? { ...line, pricingMode: "markup", pricingInputValue: markupPercent }
    : null);
}

export function applyBulkDiscount(lines: EstimateLineDto[], selectedIds: ReadonlySet<string>, discountPercent: number): EstimateBulkResult {
  return transformSelected(lines, selectedIds, (line) => ({ ...line, lineDiscountPercent: discountPercent }));
}

export function moveBulkLines(lines: EstimateLineDto[], selectedIds: ReadonlySet<string>, sectionId: string): EstimateBulkResult {
  return transformSelected(lines, selectedIds, (line) => ({ ...line, sectionId }));
}

export function updateBulkQuantity(lines: EstimateLineDto[], selectedIds: ReadonlySet<string>, quantity: number): EstimateBulkResult {
  return transformSelected(lines, selectedIds, (line) => ({ ...line, quantity }));
}

export function resetBulkToPartnerPrice(lines: EstimateLineDto[], selectedIds: ReadonlySet<string>): EstimateBulkResult {
  return transformSelected(lines, selectedIds, (line) => line.lineType === "product" && line.convertedCostUnitPrice !== null
    ? { ...line, pricingMode: "direct", pricingInputValue: line.convertedCostUnitPrice, lineDiscountPercent: 0 }
    : null);
}

function transformSelected(
  lines: EstimateLineDto[],
  selectedIds: ReadonlySet<string>,
  transform: (line: EstimateLineDto) => EstimateLineDto | null,
): EstimateBulkResult {
  let changedCount = 0;
  let skippedCount = 0;
  const transformed = lines.map((line) => {
    if (!selectedIds.has(line.id)) return line;
    const next = transform(line);
    if (!next) {
      skippedCount += 1;
      return line;
    }
    changedCount += 1;
    return next;
  });
  return { lines: transformed, changedCount, skippedCount };
}

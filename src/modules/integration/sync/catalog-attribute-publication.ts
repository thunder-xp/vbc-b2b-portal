import type { CatalogProductAttributeDTO } from "../dto";

export type CatalogAttributeSourceRow = CatalogProductAttributeDTO & {
  productId: string;
  sourceUpdatedAt: string | null;
};

export type CatalogAttributePersistenceRow = {
  product_id: string;
  property_ref: string;
  attribute_key: string;
  label: string;
  raw_value: string | number | boolean | Array<string | number | boolean>;
  display_value: string;
  resolved_display_value: string | null;
  resolution_status: CatalogProductAttributeDTO["resolutionStatus"];
  resolved_value_ref: string | null;
  value_type: string | null;
  is_filterable: boolean;
  is_visible: boolean;
  source_updated_at: string | null;
  updated_at: string;
};

export type CatalogAttributeNormalizationResult = {
  rows: CatalogAttributePersistenceRow[];
  received: number;
  uniquePairs: number;
  duplicatePairs: number;
  multiValueMerges: number;
};

export class DuplicateCatalogAttributeKeysError extends Error {
  readonly errorCategory = "duplicate_attribute_keys";
  readonly failedStage = "attribute_normalization";

  constructor() {
    super("Catalog attributes contain duplicate persistence keys after normalization.");
    this.name = "DuplicateCatalogAttributeKeysError";
  }
}

export function normalizeCatalogAttributes(
  sourceRows: CatalogAttributeSourceRow[],
  updatedAt: string,
): CatalogAttributeNormalizationResult {
  const grouped = new Map<string, CatalogAttributeSourceRow[]>();
  for (const row of sourceRows) {
    const key = `${row.productId}:${row.propertyRef}`;
    const group = grouped.get(key);
    if (group) group.push(row);
    else grouped.set(key, [row]);
  }

  let multiValueMerges = 0;
  const rows = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, group]) => {
    const ranked = [...group].sort(compareAttributePriority);
    const canonical = ranked[0];
    const preferredResolution = group.some((row) => row.resolutionStatus === "resolved")
      ? group.filter((row) => row.resolutionStatus === "resolved")
      : group;
    const preferredVisibility = preferredResolution.some((row) => row.visible)
      ? preferredResolution.filter((row) => row.visible)
      : preferredResolution;
    const readableValues = uniqueSorted(preferredVisibility.flatMap(readableValue));
    const rawValues = uniqueRawValues(preferredVisibility.map((row) => row.rawValue));
    if (readableValues.length > 1) multiValueMerges += 1;

    return {
      product_id: canonical.productId,
      property_ref: canonical.propertyRef,
      attribute_key: canonical.key,
      label: canonical.label,
      raw_value: rawValues.length === 1 ? rawValues[0] : rawValues,
      display_value: readableValues.join(", ") || canonical.displayValue.trim(),
      resolved_display_value: readableValues.length
        ? readableValues.join(", ")
        : canonical.resolvedDisplayValue?.trim() || null,
      resolution_status: group.some((row) => row.resolutionStatus === "resolved")
        ? "resolved" as const
        : canonical.resolutionStatus,
      resolved_value_ref: uniqueSorted(group.flatMap((row) => row.resolvedValueRef ? [row.resolvedValueRef] : []))[0] ?? null,
      value_type: canonical.valueType,
      is_filterable: group.some((row) => row.filterable),
      is_visible: group.some((row) => row.visible),
      source_updated_at: canonical.sourceUpdatedAt,
      updated_at: updatedAt,
    };
  });

  const remainingKeys = new Set(rows.map((row) => `${row.product_id}:${row.property_ref}`));
  if (remainingKeys.size !== rows.length) throw new DuplicateCatalogAttributeKeysError();

  return {
    rows,
    received: sourceRows.length,
    uniquePairs: rows.length,
    duplicatePairs: sourceRows.length - rows.length,
    multiValueMerges,
  };
}

function compareAttributePriority(left: CatalogAttributeSourceRow, right: CatalogAttributeSourceRow): number {
  return Number(right.resolutionStatus === "resolved") - Number(left.resolutionStatus === "resolved")
    || Number(right.visible) - Number(left.visible)
    || Number(Boolean(right.displayValue.trim())) - Number(Boolean(left.displayValue.trim()))
    || Number(right.filterable) - Number(left.filterable)
    || stableAttributeKey(left).localeCompare(stableAttributeKey(right));
}

function stableAttributeKey(row: CatalogAttributeSourceRow): string {
  return [row.resolvedDisplayValue ?? "", row.displayValue, JSON.stringify(row.rawValue), row.key, row.label].join("\u0000");
}

function readableValue(row: CatalogAttributeSourceRow): string[] {
  const value = (row.resolvedDisplayValue ?? row.displayValue).trim();
  return value ? [value] : [];
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function uniqueRawValues(values: Array<string | number | boolean>): Array<string | number | boolean> {
  const unique = new Map(values.map((value) => [`${typeof value}:${JSON.stringify(value)}`, value]));
  return [...unique.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, value]) => value);
}

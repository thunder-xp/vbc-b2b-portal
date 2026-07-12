export interface CatalogProductAttribute {
  id: string;
  productId: string;
  propertyRef: string;
  key: string;
  label: string;
  rawValue: unknown;
  displayValue: string;
  resolvedDisplayValue: string | null;
  resolutionStatus: "not_required" | "resolved" | "unresolved" | "invalid";
  valueType: string | null;
  isFilterable: boolean;
  isVisible: boolean;
}

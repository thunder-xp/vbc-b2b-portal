export interface CatalogProductAttribute {
  id: string;
  productId: string;
  propertyRef: string;
  key: string;
  label: string;
  rawValue: unknown;
  displayValue: string;
  valueType: string | null;
  isFilterable: boolean;
  isVisible: boolean;
}

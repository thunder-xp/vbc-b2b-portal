export const PRODUCT_CREATION_DATE_PROPERTY_REF = "cb442472-ac8c-11f1-639c-bc2411369b92";
export const PRODUCT_CREATION_DATE_ATTRIBUTE_KEY = `property_${PRODUCT_CREATION_DATE_PROPERTY_REF}`;

export const CATALOG_ATTRIBUTE_CLASSIFICATIONS = [
  "CUSTOMER_SPECIFICATION",
  "FACETABLE_SPECIFICATION",
  "MERCHANDISING_INTERNAL",
  "SYSTEM_INTERNAL",
] as const;

export type CatalogAttributeClassification = (typeof CATALOG_ATTRIBUTE_CLASSIFICATIONS)[number];

export function classifyCatalogAttribute(
  propertyRef: string,
  filterable: boolean,
): CatalogAttributeClassification {
  if (propertyRef.trim().toLowerCase() === PRODUCT_CREATION_DATE_PROPERTY_REF) {
    return "MERCHANDISING_INTERNAL";
  }
  return filterable ? "FACETABLE_SPECIFICATION" : "CUSTOMER_SPECIFICATION";
}

export function isCustomerFacingCatalogAttribute(
  classification: CatalogAttributeClassification,
): boolean {
  return classification === "CUSTOMER_SPECIFICATION"
    || classification === "FACETABLE_SPECIFICATION";
}

export function isCustomerFacingCatalogAttributeKey(key: string): boolean {
  return key.trim().toLowerCase() !== PRODUCT_CREATION_DATE_ATTRIBUTE_KEY;
}

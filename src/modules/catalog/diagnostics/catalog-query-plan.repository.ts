export const CATALOG_PLAN_OPERATIONS = [
  "catalog_page",
  "catalog_facets",
  "exact_sku",
  "attribute_filter",
  "stock_sort",
] as const;

export type CatalogPlanOperation = (typeof CATALOG_PLAN_OPERATIONS)[number];

export interface CatalogQueryPlanRepository {
  explain(operation: CatalogPlanOperation, companyId: string): Promise<unknown>;
}

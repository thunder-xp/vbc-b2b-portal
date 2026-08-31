export type {
  CatalogBrandDto,
  CatalogCategoryDto,
  CatalogProductCardDto,
  CatalogProductCharacteristicDto,
  CatalogProductDetailDto,
  CatalogProductDocumentDto,
  CatalogProductImageDto,
  CatalogProductListInput,
  CatalogProductListResult,
  CatalogProductOrderIdentityDto,
  CatalogProductRouteIdentityDto,
  CatalogSearchSuggestionDto,
  CatalogFacetDto,
  CatalogFacetListInput,
  CatalogService,
  ProductReferenceService,
} from "./catalog.service";
export type { ProductReferenceDto } from "../types";
export { DefaultCatalogService } from "./catalog.service";
export {
  buildCatalogComparisonMatrix,
  type CatalogComparisonMatrixRow,
} from "./catalog-comparison";
export { buildCatalogHref, buildCatalogSortHiddenFields, parseCatalogAttributeFilters, type CatalogSortHiddenField } from "./catalog-sort-state";
export { buildCatalogProductHref, buildProductDetailTabHref, parseCatalogReturnTarget } from "./catalog-return-target";
export { getCatalogCharacteristicFilterTarget, type CatalogCharacteristicFilterTarget } from "./catalog-characteristic-filter";
export { buildCatalogPaginationItems, getCatalogTotalPages, type CatalogPaginationItem } from "./catalog-pagination";
export {
  CATALOG_SORT_OPTIONS,
  parseCatalogSort,
  requiresCommercialCatalogSort,
  sortCatalogProducts,
  type CatalogSort,
} from "./catalog-sorting";
export { CATALOG_VIEW_COOKIE, parseCatalogViewMode, type CatalogViewMode } from "./catalog-view-preference";
export {
  CATALOG_QUICK_LINK_CODES,
  parseCatalogQuickLinkCode,
  resolveCatalogQuickLinks,
  type CatalogQuickLink,
  type CatalogQuickLinkCode,
} from "./catalog-quick-links";
export {
  parseCatalogRouteState,
  type CatalogRouteMode,
  type CatalogRouteState,
} from "./catalog-route-state";
export {
  resolveCategoryFilters,
  type CatalogFilterDefinition,
  type CatalogNavigationConfiguration,
} from "./catalog-configuration";
export type {
  CatalogReadModelUpdateInput,
  CatalogUpdaterService,
} from "./catalog-updater.service";
export { DefaultCatalogUpdaterService } from "./catalog-updater.service";

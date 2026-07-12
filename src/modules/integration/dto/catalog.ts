import type { ExternalReferenceDTO, IntegrationMetadataDTO } from "./common";

export type CatalogCategoryDTO = {
  reference: ExternalReferenceDTO;
  parentReference: ExternalReferenceDTO | null;
  name: string;
  slug: string | null;
  description: string | null;
  isActive: boolean;
  metadata: IntegrationMetadataDTO;
};

export type CatalogBrandDTO = {
  reference: ExternalReferenceDTO;
  name: string;
  slug: string | null;
  description: string | null;
  logoUrl: string | null;
  isActive: boolean;
  metadata: IntegrationMetadataDTO;
};

export type CatalogProductDTO = {
  reference: ExternalReferenceDTO;
  categoryReference: ExternalReferenceDTO | null;
  brandReference: ExternalReferenceDTO | null;
  sku: string;
  name: string;
  slug: string | null;
  shortDescription: string | null;
  description: string | null;
  imageUrl: string | null;
  fullDescription?: string | null;
  attributes?: CatalogProductAttributeDTO[];
  isActive: boolean;
  isVisible: boolean;
  metadata: IntegrationMetadataDTO;
};

export type CatalogProductAttributeDTO = {
  propertyRef: string;
  key: string;
  label: string;
  rawValue: string | number | boolean;
  displayValue: string;
  resolvedDisplayValue: string | null;
  resolvedValueRef: string | null;
  resolutionStatus: "not_required" | "resolved" | "unresolved" | "invalid";
  valueType: string | null;
  filterable: boolean;
  visible: boolean;
  available: boolean;
};

export type CatalogSnapshotDTO = {
  rootReference: ExternalReferenceDTO;
  rootName: string;
  categories: CatalogCategoryDTO[];
  products: CatalogProductDTO[];
  pagesProcessed: number;
  rowsReceived: number;
  diagnostics?: CatalogScanDiagnosticsDTO;
};

export type CatalogScanDiagnosticsDTO = {
  totalRowsScanned: number;
  uniqueRowsScanned: number;
  duplicateReferenceCount: number;
  configuredOrdering: "Ref_Key asc";
  folderRowsScanned: number;
  productRowsScanned: number;
  validParentReferences: number;
  rowsWithParentEqualRoot: number;
  directChildFolders: number;
  directChildProducts: number;
  descendantFoldersResolved: number;
  descendantProductsResolved: number;
  excludedDeleted: number;
  excludedInactive: number;
  excludedInvalidGuid: number;
  excludedService: number;
  excludedSet: number;
  excludedEmptyName: number;
  excludedOutsideSubtree: number;
  eligibleProducts: number;
  accountingTypeCounts: Record<string, number>;
  setValueCounts: { true: number; false: number; missing: number };
  pageSize: number;
  lastPageRowCount: number;
  scanComplete: boolean;
  propertyDefinitionsLoaded?: number;
  productsWithImageUrl?: number;
  productsWithoutImageUrl?: number;
  invalidImageUrls?: number;
  productsWithFullDescription?: number;
  productsWithAttributes?: number;
  attributeRowsReceived?: number;
  attributeRowsUpserted?: number;
  attributeRowsRemoved?: number;
  filterableAttributeRows?: number;
  referenceValuesDetected?: number;
  referenceValuesResolved?: number;
  referenceValuesUnresolved?: number;
  attributesHiddenUnresolved?: number;
  guidLikeValuesDetected?: number;
  referenceDictionaryValuesLoaded?: number;
};

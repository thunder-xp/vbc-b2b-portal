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
  isActive: boolean;
  isVisible: boolean;
  metadata: IntegrationMetadataDTO;
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
  folderRowsScanned: number;
  productRowsScanned: number;
  validParentReferences: number;
  rowsWithParentEqualRoot: number;
  directChildFolders: number;
  directChildProducts: number;
  descendantFoldersResolved: number;
  descendantProductsResolved: number;
  excludedDeleted: number;
  excludedInvalidGuid: number;
  excludedService: number;
  excludedSet: number;
  excludedEmptyName: number;
  excludedOutsideSubtree: number;
  accountingTypeCounts: Record<string, number>;
  setValueCounts: { true: number; false: number; missing: number };
  pageSize: number;
  lastPageRowCount: number;
  scanComplete: boolean;
};

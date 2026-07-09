export type SyncDomain =
  | "catalog"
  | "pricing"
  | "inventory"
  | "partners"
  | "documents"
  | "finance";

export type SyncTarget = {
  domain: SyncDomain;
  providerCode: string;
  targetCode: string;
  description: string | null;
};

export type CatalogSyncTarget = SyncTarget & {
  domain: "catalog";
  includeProducts: boolean;
  includeCategories: boolean;
  includeBrands: boolean;
};

export type PricingSyncTarget = SyncTarget & {
  domain: "pricing";
  companyScoped: boolean;
};

export type InventorySyncTarget = SyncTarget & {
  domain: "inventory";
  warehouseScoped: boolean;
};

export type PartnerSyncTarget = SyncTarget & {
  domain: "partners";
};

export type DocumentsSyncTarget = SyncTarget & {
  domain: "documents";
  documentTypes: string[];
};

export type FinanceSyncTarget = SyncTarget & {
  domain: "finance";
  includeInvoices: boolean;
  includeFinanceSnapshots: boolean;
};

export type AnySyncTarget =
  | CatalogSyncTarget
  | PricingSyncTarget
  | InventorySyncTarget
  | PartnerSyncTarget
  | DocumentsSyncTarget
  | FinanceSyncTarget;

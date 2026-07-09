import type { ERPProvider } from "../contracts";
import type {
  CatalogBrandDTO,
  CatalogCategoryDTO,
  CatalogProductDTO,
  DocumentDTO,
  FinanceSnapshotDTO,
  InvoiceDTO,
  PartnerCompanyDTO,
  ProductPriceDTO,
  StockBalanceDTO,
} from "../dto";
import type { CreateSyncJobInput, SyncJob } from "./sync-job";
import type { SyncResult } from "./sync-result";
import type { AnySyncStrategy } from "./sync-strategy";
import type { AnySyncTarget, SyncDomain } from "./sync-target";

export type SyncProviderResolver = {
  getProvider(providerCode: string): ERPProvider | null;
};

export type ReadModelUpdateResult = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  warnings: string[];
};

export interface CatalogReadModelUpdater {
  updateCatalogReadModel(
    input: Array<CatalogProductDTO | CatalogCategoryDTO | CatalogBrandDTO>,
  ): Promise<ReadModelUpdateResult>;
}

export interface PricingReadModelUpdater {
  updatePricingReadModel(
    input: ProductPriceDTO[],
  ): Promise<ReadModelUpdateResult>;
}

export interface InventoryReadModelUpdater {
  updateInventoryReadModel(
    input: StockBalanceDTO[],
  ): Promise<ReadModelUpdateResult>;
}

export interface PartnerReadModelUpdater {
  updatePartnerReadModel(
    input: PartnerCompanyDTO[],
  ): Promise<ReadModelUpdateResult>;
}

export interface DocumentsReadModelUpdater {
  updateDocumentsReadModel(input: DocumentDTO[]): Promise<ReadModelUpdateResult>;
}

export interface FinanceReadModelUpdater {
  updateFinanceReadModel(
    input: Array<FinanceSnapshotDTO | InvoiceDTO>,
  ): Promise<ReadModelUpdateResult>;
}

export type SyncReadModelUpdaters = {
  catalog?: CatalogReadModelUpdater;
  pricing?: PricingReadModelUpdater;
  inventory?: InventoryReadModelUpdater;
  partners?: PartnerReadModelUpdater;
  documents?: DocumentsReadModelUpdater;
  finance?: FinanceReadModelUpdater;
};

export type SyncPlan = {
  target: AnySyncTarget;
  strategy: AnySyncStrategy;
  provider: ERPProvider;
  readModelDomain: SyncDomain;
};

export interface SyncEngine {
  createJob(input: CreateSyncJobInput): Promise<SyncJob>;
  plan(target: AnySyncTarget, strategy: AnySyncStrategy): Promise<SyncPlan>;
  dryRun(job: SyncJob): Promise<SyncResult>;
  run(job: SyncJob): Promise<SyncResult>;
}

import type { CatalogSnapshotDTO } from "../dto";
import {
  getProductNewSourceRequestDiagnostic,
  type OneCNomenclatureODataProvider,
  type OneCProductNewProvider,
} from "../providers/one-c";
import type { CatalogSnapshotWriter, CatalogSyncState } from "./catalog-snapshot-writer";
import type { CatalogProjectionOutcome, CatalogSynchronizationOrchestrator, CatalogSynchronizationTrigger } from "./catalog-synchronization-orchestrator";
import { CatalogPersistenceError } from "./catalog-persistence-error";
import type { ProductNewFactsPublicationResult, ProductNewFactsWriter } from "./product-new-facts-writer";

export type DailyCatalogSyncResult = { state: CatalogSyncState; skippedBecauseRunning: boolean; projection: CatalogProjectionOutcome | null; newProduct: ProductNewFactsPublicationResult | null };

export class CatalogEmptySubtreeError extends Error {
  readonly failedStage = "subtree_resolution";
  readonly errorCategory = "empty_subtree";
  constructor() { super("Resolved catalog subtree is empty."); this.name = "CatalogEmptySubtreeError"; }
}

export class DailyCatalogSyncService {
  constructor(
    private readonly provider: Pick<OneCNomenclatureODataProvider, "fetchFullSnapshot">,
    private readonly writer: CatalogSnapshotWriter,
    private readonly orchestrator?: CatalogSynchronizationOrchestrator,
    private readonly newProductProvider?: Pick<OneCProductNewProvider, "fetchSnapshot">,
    private readonly newProductWriter?: ProductNewFactsWriter,
  ) {}

  async runFullSync(
    trigger: CatalogSynchronizationTrigger = "scheduled",
    context: { requestId?: string } = {},
  ): Promise<DailyCatalogSyncResult> {
    const syncId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    log({ event: "catalog_daily_sync_started", stage: "lock" });
    const acquired = await this.writer.acquireLock(syncId, startedAt);
    if (!acquired) return { state: await this.writer.getState(), skippedBecauseRunning: true, projection: null, newProduct: null };

    let stage = "root_discovery";
    let orchestrationRegistered = false;
    try {
      if (this.orchestrator) {
        await this.orchestrator.registerSourceRun(syncId, "catalog", trigger);
        orchestrationRegistered = true;
      }
      log({ event: "catalog_root_discovery_started", stage });
      const snapshot = await this.provider.fetchFullSnapshot((pageNumber, rowCount) => log({ event: "catalog_page_processed", stage: "nomenclature_scan", pageNumber, rowCount }));
      log({ event: "catalog_root_discovery_completed", stage, folderCount: snapshot.categories.length, productCount: snapshot.products.length });
      if (snapshot.pagesProcessed > 0 && snapshot.categories.length === 0 && snapshot.products.length === 0) throw new CatalogEmptySubtreeError();
      stage = "batch_persistence";
      const writeResult = await this.writer.writeSnapshot(snapshot, syncId);
      let newProduct: ProductNewFactsPublicationResult | null = null;
      if (this.newProductProvider && this.newProductWriter) {
        stage = "automated_new_source_scan";
        const newProductSnapshot = await this.newProductProvider.fetchSnapshot(snapshot.products.map((product) => product.reference.externalId));
        stage = "automated_new_publication";
        newProduct = await this.newProductWriter.publish(syncId, newProductSnapshot, snapshot.pagesProcessed);
      }
      const finishedAt = new Date().toISOString();
      await this.writer.markSucceeded(syncId, snapshot, writeResult, startedAt, finishedAt);
      const state = await this.writer.getState();
      const projection = this.orchestrator
        ? await this.orchestrator.completeSourceSync({
            sourceSyncId: syncId,
            sourceDomain: "catalog",
            changedCounts: {
              products: writeResult.productsUpserted,
              categories: writeResult.foldersUpserted,
              deactivated: writeResult.rowsDeactivated,
              images: snapshot.diagnostics?.productsWithImageUrl ?? 0,
              descriptions: snapshot.diagnostics?.productsWithFullDescription ?? 0,
              specifications: writeResult.attributesUpserted ?? 0,
            },
            sourceDurationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
          })
        : null;
      log({ event: "catalog_daily_sync_completed", stage: "completed", folderCount: snapshot.categories.length, productCount: snapshot.products.length });
      return { state, skippedBecauseRunning: false, projection, newProduct };
    } catch (error) {
      const finishedAt = new Date().toISOString();
      const errorCategory = safeErrorCategory(error);
      const failedStage = safeFailedStage(error, stage);
      const sourceDiagnostic = getProductNewSourceRequestDiagnostic(error);
      if (error instanceof CatalogPersistenceError) await this.writer.markFailed(syncId, errorCategory, failedStage, startedAt, finishedAt, error.metadata);
      else await this.writer.markFailed(syncId, errorCategory, failedStage, startedAt, finishedAt);
      if (orchestrationRegistered && this.orchestrator) await this.orchestrator.failSourceSync(syncId, "catalog", errorCategory);
      log({
        event: "catalog_daily_sync_failed",
        stage: failedStage,
        errorCategory,
        requestId: context.requestId,
        ...(sourceDiagnostic ?? {}),
        ...(error instanceof CatalogPersistenceError ? { databaseErrorCode: error.metadata.code ?? undefined, databaseConstraint: error.metadata.constraint ?? undefined, failedBatch: error.metadata.batchIndex ?? undefined } : {}),
      });
      return { state: await this.writer.getState(), skippedBecauseRunning: false, projection: null, newProduct: null };
    }
  }
}

type SafeCatalogSyncEvent = {
  event: string;
  stage: string;
  pageNumber?: number;
  rowCount?: number;
  folderCount?: number;
  productCount?: number;
  errorCategory?: string;
  databaseErrorCode?: string;
  databaseConstraint?: string;
  failedBatch?: number;
  requestId?: string;
  resourceName?: string;
  requestMethod?: "GET";
  sanitizedEndpoint?: string | null;
  httpStatus?: number | null;
  responseContentType?: string | null;
  responseLength?: number | null;
  networkCategory?: string;
  pageSize?: number;
  odataFilterName?: string;
  elapsedMs?: number;
  safeErrorExcerpt?: string | null;
};
function log(event: SafeCatalogSyncEvent) { if (event.event === "catalog_daily_sync_failed") console.error(event); else console.info(event); }
function safeErrorCategory(error: unknown): string { return hasStringProperty(error, "errorCategory") ? error.errorCategory : error instanceof Error ? error.name : "unknown_error"; }
function safeFailedStage(error: unknown, fallback: string): string { return hasStringProperty(error, "failedStage") ? error.failedStage : fallback; }
function hasStringProperty(value: unknown, key: string): value is Record<string, string> { return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>)[key] === "string"; }

export type DailyCatalogSnapshot = CatalogSnapshotDTO;

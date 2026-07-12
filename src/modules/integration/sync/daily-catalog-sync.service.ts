import type { CatalogSnapshotDTO } from "../dto";
import type { OneCNomenclatureODataProvider } from "../providers/one-c";
import type { CatalogSnapshotWriter, CatalogSyncState } from "./catalog-snapshot-writer";

export type DailyCatalogSyncResult = { state: CatalogSyncState; skippedBecauseRunning: boolean };

export class DailyCatalogSyncService {
  constructor(
    private readonly provider: Pick<OneCNomenclatureODataProvider, "fetchFullSnapshot">,
    private readonly writer: CatalogSnapshotWriter,
  ) {}

  async runFullSync(): Promise<DailyCatalogSyncResult> {
    const syncId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    log({ event: "catalog_daily_sync_started", stage: "lock" });
    const acquired = await this.writer.acquireLock(syncId, startedAt);
    if (!acquired) return { state: await this.writer.getState(), skippedBecauseRunning: true };

    let stage = "root_discovery";
    try {
      log({ event: "catalog_root_discovery_started", stage });
      const snapshot = await this.provider.fetchFullSnapshot((pageNumber, rowCount) => log({ event: "catalog_page_processed", stage: "nomenclature_scan", pageNumber, rowCount }));
      log({ event: "catalog_root_discovery_completed", stage, folderCount: snapshot.categories.length, productCount: snapshot.products.length });
      stage = "batch_persistence";
      const writeResult = await this.writer.writeSnapshot(snapshot, syncId);
      const finishedAt = new Date().toISOString();
      await this.writer.markSucceeded(syncId, snapshot, writeResult, startedAt, finishedAt);
      const state = await this.writer.getState();
      log({ event: "catalog_daily_sync_completed", stage: "completed", folderCount: snapshot.categories.length, productCount: snapshot.products.length });
      return { state, skippedBecauseRunning: false };
    } catch (error) {
      const finishedAt = new Date().toISOString();
      const errorCategory = safeErrorCategory(error);
      await this.writer.markFailed(syncId, errorCategory, stage, startedAt, finishedAt);
      log({ event: "catalog_daily_sync_failed", stage, errorCategory });
      return { state: await this.writer.getState(), skippedBecauseRunning: false };
    }
  }
}

type SafeCatalogSyncEvent = { event: string; stage: string; pageNumber?: number; rowCount?: number; folderCount?: number; productCount?: number; errorCategory?: string };
function log(event: SafeCatalogSyncEvent) { if (event.event === "catalog_daily_sync_failed") console.error(event); else console.info(event); }
function safeErrorCategory(error: unknown): string { return error instanceof Error ? error.name : "unknown_error"; }

export type DailyCatalogSnapshot = CatalogSnapshotDTO;

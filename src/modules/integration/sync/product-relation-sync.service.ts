import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { createAdminClient } from "@/src/lib/supabase/admin";
import type {
  OneCProductRelationProvider,
  ProductRelationSnapshot,
  ProductRelationSourceRow,
} from "../providers/one-c";

const BATCH_SIZE = 500;
const STALE_LOCK_HOURS = 2;

export type ProductRelationSyncResult = {
  syncId: string;
  analogRowsReceived: number;
  relatedRowsReceived: number;
  staged: number;
  published: number;
  rejected: number;
  duplicatesCollapsed: number;
  sourceProductsWithAnalogs: number;
  sourceProductsWithRelated: number;
  durationMs: number;
};

export class ProductRelationSyncInProgressError extends Error {
  constructor(readonly syncId: string | null) {
    super("Product relation synchronization is already running.");
    this.name = "ProductRelationSyncInProgressError";
  }
}

export class ProductRelationSyncService {
  constructor(private readonly provider: OneCProductRelationProvider) {}

  async synchronize(): Promise<ProductRelationSyncResult> {
    const client = createAdminClient();
    const syncId = randomUUID();
    const startedAt = new Date();
    const staleBefore = new Date(startedAt.getTime() - STALE_LOCK_HOURS * 60 * 60 * 1000).toISOString();
    const { error: staleError } = await client.from("product_relation_sync_runs").update({
      status: "failed",
      finished_at: startedAt.toISOString(),
      lock_acquired_at: null,
      safe_error_code: "STALE_LOCK_RECOVERED",
      updated_at: startedAt.toISOString(),
    }).eq("status", "running").lt("lock_acquired_at", staleBefore);
    if (staleError) throw persistenceError("stale_lock_recovery", staleError);

    const { error: lockError } = await client.from("product_relation_sync_runs").insert({
      id: syncId,
      status: "running",
      started_at: startedAt.toISOString(),
      lock_acquired_at: startedAt.toISOString(),
    });
    if (lockError?.code === "23505") {
      const { data } = await client.from("product_relation_sync_runs").select("id")
        .eq("status", "running").limit(1).maybeSingle();
      throw new ProductRelationSyncInProgressError(typeof data?.id === "string" ? data.id : null);
    }
    if (lockError) throw persistenceError("lock_acquisition", lockError);

    console.info({ event: "product_relation_sync_started", syncId });
    try {
      const snapshot = await this.provider.loadSnapshot();
      await this.stage(syncId, snapshot);
      const { data, error } = await client.rpc("publish_product_relation_snapshot", { p_sync_id: syncId });
      if (error) throw persistenceError("publication", error);
      const publication = parsePublication(data);
      const result: ProductRelationSyncResult = {
        syncId,
        analogRowsReceived: snapshot.analogRowsReceived,
        relatedRowsReceived: snapshot.relatedRowsReceived,
        staged: snapshot.rows.length,
        published: publication.published,
        rejected: snapshot.rejections.length,
        duplicatesCollapsed: snapshot.duplicatesCollapsed,
        sourceProductsWithAnalogs: publication.sourceProductsWithAnalogs,
        sourceProductsWithRelated: publication.sourceProductsWithRelated,
        durationMs: Date.now() - startedAt.getTime(),
      };
      console.info({ event: "product_relation_sync_succeeded", ...result });
      return result;
    } catch (error) {
      const safeErrorCode = error instanceof Error
        ? error.name.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 80)
        : "UNKNOWN";
      await client.from("product_relation_sync_runs").update({
        status: "failed",
        finished_at: new Date().toISOString(),
        lock_acquired_at: null,
        safe_error_code: safeErrorCode,
        duration_ms: Date.now() - startedAt.getTime(),
        updated_at: new Date().toISOString(),
      }).eq("id", syncId);
      console.error({ event: "product_relation_sync_failed", syncId, safeErrorCode });
      throw error;
    }
  }

  private async stage(syncId: string, snapshot: ProductRelationSnapshot): Promise<void> {
    const client = createAdminClient();
    for (const batch of chunks(snapshot.rows, BATCH_SIZE)) {
      const { error } = await client.from("product_relation_sync_stage").insert(
        batch.map((row) => stageRow(syncId, row)),
      );
      if (error) throw persistenceError("staging", error);
    }
    if (snapshot.rejections.length) {
      const { error } = await client.from("product_relation_sync_rejections").insert(
        snapshot.rejections.map((row) => ({
          sync_id: syncId,
          relation_type: row.relationType,
          reason: row.reason,
          source_product_external_1c_id: row.sourceProductRef ?? null,
          target_product_external_1c_id: row.targetProductRef ?? null,
          page_number: row.page,
          row_index: row.rowIndex,
        })),
      );
      if (error) throw persistenceError("rejection_staging", error);
    }
    const characteristicRows = snapshot.rows.filter((row) =>
      row.sourceCharacteristicRef || row.targetCharacteristicRef,
    ).length;
    const malformedRows = snapshot.rejections.filter((row) =>
      row.reason === "invalid_shape" || row.reason === "invalid_source"
      || row.reason === "invalid_target" || row.reason === "invalid_characteristic",
    ).length;
    const selfRelations = snapshot.rejections.filter((row) => row.reason === "self_relation").length;
    const { error } = await client.from("product_relation_sync_runs").update({
      analog_rows_received: snapshot.analogRowsReceived,
      related_rows_received: snapshot.relatedRowsReceived,
      rows_staged: snapshot.rows.length,
      duplicate_rows: snapshot.duplicatesCollapsed,
      malformed_rows: malformedRows,
      self_relations: selfRelations,
      characteristic_rows: characteristicRows,
      pages_processed: snapshot.pagesProcessed,
      updated_at: new Date().toISOString(),
    }).eq("id", syncId);
    if (error) throw persistenceError("run_diagnostics", error);
  }
}

function stageRow(syncId: string, row: ProductRelationSourceRow) {
  const fingerprint = createHash("sha256").update([
    row.relationType, row.sourceProductRef, row.targetProductRef,
    row.sourceCharacteristicRef ?? "", row.targetCharacteristicRef ?? "",
    String(row.priority),
  ].join(":"), "utf8").digest("hex");
  return {
    sync_id: syncId,
    relation_type: row.relationType,
    source_product_external_1c_id: row.sourceProductRef,
    target_product_external_1c_id: row.targetProductRef,
    source_characteristic_external_1c_id: row.sourceCharacteristicRef,
    target_characteristic_external_1c_id: row.targetCharacteristicRef,
    source_priority: row.priority,
    source_ordinal: row.sourceOrdinal,
    source_fingerprint: fingerprint,
  };
}

function parsePublication(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Invalid relation publication result.");
  const row = value as Record<string, unknown>;
  const published = Number(row.published);
  const sourceProductsWithAnalogs = Number(row.sourceProductsWithAnalogs);
  const sourceProductsWithRelated = Number(row.sourceProductsWithRelated);
  if (![published, sourceProductsWithAnalogs, sourceProductsWithRelated].every(Number.isInteger)) {
    throw new Error("Invalid relation publication counts.");
  }
  return { published, sourceProductsWithAnalogs, sourceProductsWithRelated };
}

function chunks<T>(rows: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) =>
    rows.slice(index * size, (index + 1) * size),
  );
}

function persistenceError(stage: string, error: { code?: string }) {
  return new Error(`Product relation ${stage} failed (${error.code || "UNKNOWN"}).`);
}

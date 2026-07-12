import "server-only";

import { createAdminClient } from "../../../lib/supabase/admin";
import type { CatalogCategoryDTO, CatalogProductDTO, CatalogSnapshotDTO } from "../dto";

const BATCH_SIZE = 200;
const STALE_LOCK_MS = 2 * 60 * 60 * 1000;

export type CatalogSnapshotWriteResult = { foldersUpserted: number; productsUpserted: number; rowsDeactivated: number };
export type CatalogSyncState = { status: string; rootName: string | null; lastSuccessfulSyncAt: string | null; durationMs: number | null; pagesProcessed: number; foldersReceived: number; productsReceived: number; foldersUpserted: number; productsUpserted: number; rowsDeactivated: number; errorCategory: string | null; nextScheduledRun: string };

export interface CatalogSnapshotWriter {
  acquireLock(syncId: string, startedAt: string): Promise<boolean>;
  writeSnapshot(snapshot: CatalogSnapshotDTO, syncId: string): Promise<CatalogSnapshotWriteResult>;
  markSucceeded(syncId: string, snapshot: CatalogSnapshotDTO, result: CatalogSnapshotWriteResult, startedAt: string, finishedAt: string): Promise<void>;
  markFailed(syncId: string, errorCategory: string, startedAt: string, finishedAt: string): Promise<void>;
  getState(): Promise<CatalogSyncState>;
}

export class SupabaseCatalogSnapshotWriter implements CatalogSnapshotWriter {
  async acquireLock(syncId: string, startedAt: string): Promise<boolean> {
    const client = createAdminClient();
    const staleBefore = new Date(Date.parse(startedAt) - STALE_LOCK_MS).toISOString();
    const { data, error: updateError } = await client.from("catalog_sync_state").update({ status: "running", active_sync_id: syncId, lock_acquired_at: startedAt, last_started_at: startedAt, error_category: null, updated_at: startedAt }).eq("id", "daily_catalog").or(`status.neq.running,lock_acquired_at.is.null,lock_acquired_at.lt.${staleBefore}`).select("id");
    if (updateError) throw new Error("Catalog sync lock could not be acquired.");
    return data.length === 1;
  }

  async writeSnapshot(snapshot: CatalogSnapshotDTO, syncId: string): Promise<CatalogSnapshotWriteResult> {
    const client = createAdminClient();
    const { error: snapshotStateError } = await client.from("catalog_sync_state").update({ root_external_1c_id: snapshot.rootReference.externalId, root_name: snapshot.rootName, pages_processed: snapshot.pagesProcessed, folders_received: snapshot.categories.length, products_received: snapshot.products.length, updated_at: new Date().toISOString() }).eq("id", "daily_catalog").eq("active_sync_id", syncId);
    if (snapshotStateError) throw new Error("Catalog sync snapshot state could not be stored.");
    const categoryIds = new Map<string, string>();
    const levels = parentLevels(snapshot.categories, snapshot.rootReference.externalId);
    let foldersUpserted = 0;
    for (const batch of levels.flatMap((level) => chunks(level, BATCH_SIZE))) {
      const payload = batch.map((category) => ({ external_1c_id: category.reference.externalId, external_parent_1c_id: category.parentReference?.externalId ?? null, parent_id: category.parentReference ? categoryIds.get(category.parentReference.externalId) ?? null : null, name: category.name, slug: stableSlug(category.slug, category.name, category.reference.externalId), is_active: category.isActive, source_version: category.metadata.sourceVersion ?? null, source_modified_at: category.metadata.sourceUpdatedAt, source_root_1c_id: snapshot.rootReference.externalId, last_seen_sync_id: syncId }));
      const { data, error } = await client.from("catalog_categories").upsert(payload, { onConflict: "external_1c_id" }).select("id, external_1c_id");
      if (error) throw new Error("Catalog category batch failed.");
      for (const row of data) categoryIds.set(row.external_1c_id, row.id);
      foldersUpserted += data.length;
    }

    let productsUpserted = 0;
    for (const batch of chunks(snapshot.products, BATCH_SIZE)) {
      const payload = batch.map((product) => ({ external_1c_id: product.reference.externalId, external_parent_1c_id: product.categoryReference?.externalId ?? null, category_id: product.categoryReference ? categoryIds.get(product.categoryReference.externalId) ?? null : null, sku: product.sku, name: product.name, slug: stableSlug(product.slug, product.name || product.sku, product.reference.externalId), description: product.description, is_active: product.isActive, source_version: product.metadata.sourceVersion ?? null, source_modified_at: product.metadata.sourceUpdatedAt, source_root_1c_id: snapshot.rootReference.externalId, last_seen_sync_id: syncId }));
      const { data, error } = await client.from("catalog_products").upsert(payload, { onConflict: "external_1c_id" }).select("id");
      if (error) throw new Error("Catalog product batch failed.");
      productsUpserted += data.length;
    }

    const { data: rowsDeactivated, error: deactivateError } = await client.rpc("finalize_catalog_sync_deactivation", { p_root_external_1c_id: snapshot.rootReference.externalId, p_sync_id: syncId });
    if (deactivateError) throw new Error("Catalog stale-row deactivation failed.");
    return { foldersUpserted, productsUpserted, rowsDeactivated: Number(rowsDeactivated ?? 0) };
  }

  async markSucceeded(syncId: string, snapshot: CatalogSnapshotDTO, result: CatalogSnapshotWriteResult, startedAt: string, finishedAt: string) { await updateState({ status: "succeeded", root_external_1c_id: snapshot.rootReference.externalId, root_name: snapshot.rootName, last_finished_at: finishedAt, last_successful_sync_at: finishedAt, duration_ms: Date.parse(finishedAt) - Date.parse(startedAt), pages_processed: snapshot.pagesProcessed, folders_received: snapshot.categories.length, products_received: snapshot.products.length, folders_upserted: result.foldersUpserted, products_upserted: result.productsUpserted, rows_deactivated: result.rowsDeactivated, error_category: null, active_sync_id: null, lock_acquired_at: null, updated_at: finishedAt }, syncId); }
  async markFailed(syncId: string, errorCategory: string, startedAt: string, finishedAt: string) { await updateState({ status: "failed", last_finished_at: finishedAt, duration_ms: Date.parse(finishedAt) - Date.parse(startedAt), error_category: errorCategory, active_sync_id: null, lock_acquired_at: null, updated_at: finishedAt }, syncId); }
  async getState(): Promise<CatalogSyncState> { const { data, error } = await createAdminClient().from("catalog_sync_state").select("*").eq("id", "daily_catalog").single(); if (error) throw new Error("Catalog sync state is unavailable."); return { status: data.status, rootName: data.root_name, lastSuccessfulSyncAt: data.last_successful_sync_at, durationMs: data.duration_ms, pagesProcessed: data.pages_processed, foldersReceived: data.folders_received, productsReceived: data.products_received, foldersUpserted: data.folders_upserted, productsUpserted: data.products_upserted, rowsDeactivated: data.rows_deactivated, errorCategory: data.error_category, nextScheduledRun: nextRun(data.last_successful_sync_at) }; }
}

function parentLevels(categories: CatalogCategoryDTO[], rootId: string): CatalogCategoryDTO[][] { const pending = [...categories]; const resolved = new Set([rootId]); const levels: CatalogCategoryDTO[][] = []; while (pending.length) { const level = pending.filter((item) => !item.parentReference || resolved.has(item.parentReference.externalId)); if (!level.length) throw new Error("Catalog category hierarchy is invalid."); levels.push(level); for (const item of level) { resolved.add(item.reference.externalId); pending.splice(pending.indexOf(item), 1); } } return levels; }
function chunks<T>(items: T[], size: number): T[][] { const result: T[][] = []; for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size)); return result; }
function stableSlug(slug: string | null, fallback: string, reference: string): string { const base = (slug || fallback).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "catalog-item"; return `${base}-${reference.slice(0, 8)}`; }
async function updateState(payload: Record<string, unknown>, syncId: string) { const { error } = await createAdminClient().from("catalog_sync_state").update(payload).eq("id", "daily_catalog").eq("active_sync_id", syncId); if (error) throw new Error("Catalog sync state update failed."); }
function nextRun(lastSuccess: string | null): string { const base = lastSuccess ? new Date(lastSuccess) : new Date(); const next = new Date(base); next.setDate(next.getDate() + (lastSuccess ? 1 : 0)); next.setHours(2, 0, 0, 0); if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1); return next.toISOString(); }

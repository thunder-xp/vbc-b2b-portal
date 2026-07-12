import "server-only";

import { createAdminClient } from "../../../lib/supabase/admin";
import type { CatalogCategoryDTO, CatalogProductDTO, CatalogSnapshotDTO } from "../dto";
import { normalizeCatalogAttributes } from "./catalog-attribute-publication";
import { catalogPersistenceError, type CatalogPersistenceErrorMetadata } from "./catalog-persistence-error";

const BATCH_SIZE = 200;
const STALE_LOCK_MS = 2 * 60 * 60 * 1000;

export type CatalogSnapshotWriteResult = { foldersUpserted: number; productsUpserted: number; rowsDeactivated: number; attributesUpserted?: number; attributesRemoved?: number; attributeUniquePairs?: number; attributeDuplicatePairs?: number; attributeMultiValueMerges?: number; attributeBatchesStaged?: number; attributePublicationTransactionSucceeded?: boolean };
export type CatalogSyncState = { status: string; rootName: string | null; lastSuccessfulSyncAt: string | null; durationMs: number | null; pagesProcessed: number; foldersReceived: number; productsReceived: number; foldersUpserted: number; productsUpserted: number; rowsDeactivated: number; errorCategory: string | null; failedStage: string | null; databaseErrorCode?: string | null; databaseConstraint?: string | null; failedBatch?: number | null; diagnostics?: NonNullable<CatalogSnapshotDTO["diagnostics"]> | null; nextScheduledRun: string };

export interface CatalogSnapshotWriter {
  acquireLock(syncId: string, startedAt: string): Promise<boolean>;
  writeSnapshot(snapshot: CatalogSnapshotDTO, syncId: string): Promise<CatalogSnapshotWriteResult>;
  markSucceeded(syncId: string, snapshot: CatalogSnapshotDTO, result: CatalogSnapshotWriteResult, startedAt: string, finishedAt: string): Promise<void>;
  markFailed(syncId: string, errorCategory: string, failedStage: string, startedAt: string, finishedAt: string, metadata?: CatalogPersistenceErrorMetadata): Promise<void>;
  getState(): Promise<CatalogSyncState>;
}

export class SupabaseCatalogSnapshotWriter implements CatalogSnapshotWriter {
  async acquireLock(syncId: string, startedAt: string): Promise<boolean> {
    const client = createAdminClient();
    const staleBefore = new Date(Date.parse(startedAt) - STALE_LOCK_MS).toISOString();
    const { data, error: updateError } = await client.from("catalog_sync_state").update({ status: "running", active_sync_id: syncId, lock_acquired_at: startedAt, last_started_at: startedAt, error_category: null, failed_stage: null, updated_at: startedAt }).eq("id", "daily_catalog").or(`status.neq.running,lock_acquired_at.is.null,lock_acquired_at.lt.${staleBefore}`).select("id");
    if (updateError) throw new Error("Catalog sync lock could not be acquired.");
    return data.length === 1;
  }

  async writeSnapshot(snapshot: CatalogSnapshotDTO, syncId: string): Promise<CatalogSnapshotWriteResult> {
    const client = createAdminClient();
    const { error: snapshotStateError } = await client.from("catalog_sync_state").update({ root_external_1c_id: snapshot.rootReference.externalId, root_name: snapshot.rootName, pages_processed: snapshot.pagesProcessed, folders_received: snapshot.categories.length, products_received: snapshot.products.length, ...diagnosticPayload(snapshot), ...enrichmentDiagnosticPayload(snapshot), updated_at: new Date().toISOString() }).eq("id", "daily_catalog").eq("active_sync_id", syncId);
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
    const productIds = new Map<string, string>();
    for (const batch of chunks(snapshot.products, BATCH_SIZE)) {
      const payload = batch.map((product) => ({ external_1c_id: product.reference.externalId, external_parent_1c_id: product.categoryReference?.externalId ?? null, category_id: product.categoryReference ? categoryIds.get(product.categoryReference.externalId) ?? null : null, sku: product.sku, name: product.name, slug: stableSlug(product.slug, product.name || product.sku, product.reference.externalId), short_description: product.shortDescription, description: product.description, full_description: product.fullDescription ?? product.description, image_source_url: product.imageUrl, enrichment_synced_at: new Date().toISOString(), enrichment_source_version: product.metadata.sourceVersion ?? null, is_active: product.isActive, source_version: product.metadata.sourceVersion ?? null, source_modified_at: product.metadata.sourceUpdatedAt, source_root_1c_id: snapshot.rootReference.externalId, last_seen_sync_id: syncId }));
      const { data, error } = await client.from("catalog_products").upsert(payload, { onConflict: "external_1c_id" }).select("id, external_1c_id");
      if (error) throw new Error("Catalog product batch failed.");
      for (const row of data) productIds.set(row.external_1c_id, row.id);
      productsUpserted += data.length;
    }

    const normalizedAttributes = normalizeCatalogAttributes(
      snapshot.products.flatMap((product) => (product.attributes ?? []).flatMap((attribute) => {
        const productId = productIds.get(product.reference.externalId);
        return productId ? [{ ...attribute, productId, sourceUpdatedAt: product.metadata.sourceUpdatedAt }] : [];
      })),
      new Date().toISOString(),
    );
    const attributeBatches = chunks(normalizedAttributes.rows, BATCH_SIZE);
    await updateState({ attribute_rows_received: normalizedAttributes.received, attribute_unique_pairs: normalizedAttributes.uniquePairs, attribute_duplicate_pairs: normalizedAttributes.duplicatePairs, attribute_multivalue_merges: normalizedAttributes.multiValueMerges, attribute_batches_staged: 0, attribute_rows_published: 0, attribute_publication_transaction_succeeded: false, updated_at: new Date().toISOString() }, syncId);
    const { error: clearStageError } = await client.from("catalog_product_attribute_sync_stage").delete().eq("sync_id", syncId);
    if (clearStageError) throw catalogPersistenceError("attribute_staging", clearStageError);
    try {
      for (const [batchIndex, batch] of attributeBatches.entries()) {
        const payload = batch.map((row) => ({ sync_id: syncId, ...row }));
        const { error } = await client.from("catalog_product_attribute_sync_stage").insert(payload);
        if (error) throw catalogPersistenceError("attribute_staging", error, batchIndex + 1, batch.length);
        await updateState({ attribute_batches_staged: batchIndex + 1, updated_at: new Date().toISOString() }, syncId);
      }
      const { data: publication, error: publicationError } = await client.rpc("publish_catalog_product_attributes", { p_sync_id: syncId, p_product_ids: [...productIds.values()] });
      if (publicationError) throw catalogPersistenceError("attribute_publication", publicationError, attributeBatches.length, normalizedAttributes.rows.length);
      const publicationResult = readAttributePublicationResult(publication);

      const { data: rowsDeactivated, error: deactivateError } = await client.rpc("finalize_catalog_sync_deactivation", { p_root_external_1c_id: snapshot.rootReference.externalId, p_sync_id: syncId });
      if (deactivateError) throw new Error("Catalog stale-row deactivation failed.");
      return { foldersUpserted, productsUpserted, rowsDeactivated: Number(rowsDeactivated ?? 0), attributesUpserted: publicationResult.published, attributesRemoved: publicationResult.removed, attributeUniquePairs: normalizedAttributes.uniquePairs, attributeDuplicatePairs: normalizedAttributes.duplicatePairs, attributeMultiValueMerges: normalizedAttributes.multiValueMerges, attributeBatchesStaged: attributeBatches.length, attributePublicationTransactionSucceeded: true };
    } catch (error) {
      await client.from("catalog_product_attribute_sync_stage").delete().eq("sync_id", syncId);
      throw error;
    }

  }

  async markSucceeded(syncId: string, snapshot: CatalogSnapshotDTO, result: CatalogSnapshotWriteResult, startedAt: string, finishedAt: string) { await updateState({ status: "succeeded", root_external_1c_id: snapshot.rootReference.externalId, root_name: snapshot.rootName, last_finished_at: finishedAt, last_successful_sync_at: finishedAt, duration_ms: Date.parse(finishedAt) - Date.parse(startedAt), pages_processed: snapshot.pagesProcessed, folders_received: snapshot.categories.length, products_received: snapshot.products.length, folders_upserted: result.foldersUpserted, products_upserted: result.productsUpserted, rows_deactivated: result.rowsDeactivated, attribute_rows_upserted: result.attributesUpserted ?? 0, attribute_rows_published: result.attributesUpserted ?? 0, attribute_rows_removed: result.attributesRemoved ?? 0, attribute_unique_pairs: result.attributeUniquePairs ?? 0, attribute_duplicate_pairs: result.attributeDuplicatePairs ?? 0, attribute_multivalue_merges: result.attributeMultiValueMerges ?? 0, attribute_batches_staged: result.attributeBatchesStaged ?? 0, attribute_publication_transaction_succeeded: result.attributePublicationTransactionSucceeded ?? false, database_error_code: null, database_constraint: null, failed_batch: null, error_category: null, failed_stage: null, active_sync_id: null, lock_acquired_at: null, updated_at: finishedAt }, syncId); }
  async markFailed(syncId: string, errorCategory: string, failedStage: string, startedAt: string, finishedAt: string, metadata?: CatalogPersistenceErrorMetadata) { await updateState({ status: "failed", last_finished_at: finishedAt, duration_ms: Date.parse(finishedAt) - Date.parse(startedAt), error_category: errorCategory, failed_stage: failedStage, database_error_code: metadata?.code ?? null, database_constraint: metadata?.constraint ?? null, failed_batch: metadata?.batchIndex ?? null, attribute_rows_published: 0, attribute_publication_transaction_succeeded: false, active_sync_id: null, lock_acquired_at: null, updated_at: finishedAt }, syncId); }
  async getState(): Promise<CatalogSyncState> { const { data, error } = await createAdminClient().from("catalog_sync_state").select("*").eq("id", "daily_catalog").single(); if (error) throw new Error("Catalog sync state is unavailable."); return { status: data.status, rootName: data.root_name, lastSuccessfulSyncAt: data.last_successful_sync_at, durationMs: data.duration_ms, pagesProcessed: data.pages_processed, foldersReceived: data.folders_received, productsReceived: data.products_received, foldersUpserted: data.folders_upserted, productsUpserted: data.products_upserted, rowsDeactivated: data.rows_deactivated, errorCategory: data.error_category, failedStage: data.failed_stage, databaseErrorCode: data.database_error_code, databaseConstraint: data.database_constraint, failedBatch: data.failed_batch, diagnostics: readDiagnostics(data), nextScheduledRun: nextRun(data.last_successful_sync_at) }; }
}

function parentLevels(categories: CatalogCategoryDTO[], rootId: string): CatalogCategoryDTO[][] { const pending = [...categories]; const resolved = new Set([rootId]); const levels: CatalogCategoryDTO[][] = []; while (pending.length) { const level = pending.filter((item) => !item.parentReference || resolved.has(item.parentReference.externalId)); if (!level.length) throw new Error("Catalog category hierarchy is invalid."); levels.push(level); for (const item of level) { resolved.add(item.reference.externalId); pending.splice(pending.indexOf(item), 1); } } return levels; }
function chunks<T>(items: T[], size: number): T[][] { const result: T[][] = []; for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size)); return result; }
function stableSlug(slug: string | null, fallback: string, reference: string): string { const base = (slug || fallback).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "catalog-item"; return `${base}-${reference.slice(0, 8)}`; }
async function updateState(payload: Record<string, unknown>, syncId: string) { const { error } = await createAdminClient().from("catalog_sync_state").update(payload).eq("id", "daily_catalog").eq("active_sync_id", syncId); if (error) throw new Error("Catalog sync state update failed."); }
function nextRun(lastSuccess: string | null): string { const base = lastSuccess ? new Date(lastSuccess) : new Date(); const next = new Date(base); next.setDate(next.getDate() + (lastSuccess ? 1 : 0)); next.setHours(2, 0, 0, 0); if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1); return next.toISOString(); }
function enrichmentDiagnosticPayload(snapshot: CatalogSnapshotDTO) { const d = snapshot.diagnostics; return d ? { property_definitions_loaded: d.propertyDefinitionsLoaded ?? 0, products_with_image_url: d.productsWithImageUrl ?? 0, products_without_image_url: d.productsWithoutImageUrl ?? 0, invalid_image_urls: d.invalidImageUrls ?? 0, products_with_full_description: d.productsWithFullDescription ?? 0, products_with_attributes: d.productsWithAttributes ?? 0, attribute_rows_received: d.attributeRowsReceived ?? 0, filterable_attribute_rows: d.filterableAttributeRows ?? 0, reference_values_detected: d.referenceValuesDetected ?? 0, reference_values_resolved: d.referenceValuesResolved ?? 0, reference_values_unresolved: d.referenceValuesUnresolved ?? 0, attributes_hidden_unresolved: d.attributesHiddenUnresolved ?? 0, guid_like_values_detected: d.guidLikeValuesDetected ?? 0, reference_dictionary_values_loaded: d.referenceDictionaryValuesLoaded ?? 0 } : {}; }
function diagnosticPayload(snapshot: CatalogSnapshotDTO) { const d = snapshot.diagnostics; if (!d) return {}; return { configured_ordering: d.configuredOrdering, total_rows_scanned: d.totalRowsScanned, unique_rows_scanned: d.uniqueRowsScanned, duplicate_reference_count: d.duplicateReferenceCount, folder_rows_scanned: d.folderRowsScanned, product_rows_scanned: d.productRowsScanned, valid_parent_references: d.validParentReferences, rows_with_parent_equal_root: d.rowsWithParentEqualRoot, direct_child_folders: d.directChildFolders, direct_child_products: d.directChildProducts, descendant_folders_resolved: d.descendantFoldersResolved, descendant_products_resolved: d.descendantProductsResolved, eligible_products: d.eligibleProducts, excluded_deleted: d.excludedDeleted, excluded_inactive: d.excludedInactive, excluded_invalid_guid: d.excludedInvalidGuid, excluded_service: d.excludedService, excluded_set: d.excludedSet, excluded_empty_name: d.excludedEmptyName, excluded_outside_subtree: d.excludedOutsideSubtree, accounting_type_counts: d.accountingTypeCounts, set_value_counts: d.setValueCounts, scan_page_size: d.pageSize, last_page_row_count: d.lastPageRowCount, scan_complete: d.scanComplete }; }
function readDiagnostics(data: Record<string, unknown>): NonNullable<CatalogSnapshotDTO["diagnostics"]> | null { if (typeof data.total_rows_scanned !== "number") return null; return { configuredOrdering: "Ref_Key asc", totalRowsScanned: numberValue(data.total_rows_scanned), uniqueRowsScanned: numberValue(data.unique_rows_scanned), duplicateReferenceCount: numberValue(data.duplicate_reference_count), folderRowsScanned: numberValue(data.folder_rows_scanned), productRowsScanned: numberValue(data.product_rows_scanned), validParentReferences: numberValue(data.valid_parent_references), rowsWithParentEqualRoot: numberValue(data.rows_with_parent_equal_root), directChildFolders: numberValue(data.direct_child_folders), directChildProducts: numberValue(data.direct_child_products), descendantFoldersResolved: numberValue(data.descendant_folders_resolved), descendantProductsResolved: numberValue(data.descendant_products_resolved), eligibleProducts: numberValue(data.eligible_products), excludedDeleted: numberValue(data.excluded_deleted), excludedInactive: numberValue(data.excluded_inactive), excludedInvalidGuid: numberValue(data.excluded_invalid_guid), excludedService: numberValue(data.excluded_service), excludedSet: numberValue(data.excluded_set), excludedEmptyName: numberValue(data.excluded_empty_name), excludedOutsideSubtree: numberValue(data.excluded_outside_subtree), accountingTypeCounts: isCountRecord(data.accounting_type_counts) ? data.accounting_type_counts : {}, setValueCounts: isSetCounts(data.set_value_counts) ? data.set_value_counts : { true: 0, false: 0, missing: 0 }, pageSize: numberValue(data.scan_page_size), lastPageRowCount: numberValue(data.last_page_row_count), scanComplete: data.scan_complete === true, propertyDefinitionsLoaded: numberValue(data.property_definitions_loaded), productsWithImageUrl: numberValue(data.products_with_image_url), productsWithoutImageUrl: numberValue(data.products_without_image_url), invalidImageUrls: numberValue(data.invalid_image_urls), productsWithFullDescription: numberValue(data.products_with_full_description), productsWithAttributes: numberValue(data.products_with_attributes), attributeRowsReceived: numberValue(data.attribute_rows_received), attributeRowsUpserted: numberValue(data.attribute_rows_upserted), attributeRowsRemoved: numberValue(data.attribute_rows_removed), attributeUniquePairs: numberValue(data.attribute_unique_pairs), attributeDuplicatePairs: numberValue(data.attribute_duplicate_pairs), attributeMultiValueMerges: numberValue(data.attribute_multivalue_merges), attributeBatchesStaged: numberValue(data.attribute_batches_staged), attributeRowsPublished: numberValue(data.attribute_rows_published), attributePublicationTransactionSucceeded: data.attribute_publication_transaction_succeeded === true, filterableAttributeRows: numberValue(data.filterable_attribute_rows) }; }
function numberValue(value: unknown): number { return typeof value === "number" ? value : 0; }
function readAttributePublicationResult(value: unknown): { published: number; removed: number } {
  if (typeof value !== "object" || value === null) throw new Error("Catalog attribute publication returned an invalid result.");
  const result = value as Record<string, unknown>;
  return { published: numberValue(result.published), removed: numberValue(result.removed) };
}
function isSetCounts(value: unknown): value is { true: number; false: number; missing: number } { return isCountRecord(value) && typeof value.true === "number" && typeof value.false === "number" && typeof value.missing === "number"; }
function isCountRecord(value: unknown): value is Record<string, number> { return typeof value === "object" && value !== null && Object.values(value).every((item) => typeof item === "number"); }

import "server-only";

import { createAdminClient } from "../../../lib/supabase/admin";
import type { CurrencyStageRow, PriceChunkProvider, PriceRegisterStageRow, PriceTypeStageRow } from "../providers/one-c";

export const PRICE_SYNC_PAGE_SIZE = 500;
export const PRICE_SYNC_PAGES_PER_INVOCATION = 5;
export const PRICE_SYNC_DURATION_BUDGET_MS = 45_000;
export const PRICE_SYNC_STALE_LOCK_MS = 10 * 60 * 1000;

export type PriceSyncStatus = "never_run" | "queued" | "running" | "succeeded" | "failed";
export type PriceSyncStage = "price_type_scan" | "currency_scan" | "price_register_scan" | "price_aggregation" | "price_publication" | "completed";
export type PriceSyncState = { status: PriceSyncStatus; activeSyncId: string | null; startedAt: string | null; finishedAt: string | null; lastSuccessfulSyncAt: string | null; currentStage: PriceSyncStage | null; nextSkip: number; pageSize: number; pagesProcessed: number; rowsScanned: number; rowsStaged: number; latestPricesResolved: number; pricesPublished: number; pricesDeactivated: number; unmatchedProducts: number; unknownPriceTypes: number; scanComplete: boolean; errorCategory: string | null; failedStage: string | null; databaseErrorCode: string | null; failedPage: number | null; updatedAt: string };
export type PriceSyncChunkResult = { state: PriceSyncState; needsContinuation: boolean; pagesProcessedThisInvocation: number };

export interface PriceSyncStateStore {
  start(): Promise<{ state: PriceSyncState; started: boolean }>;
  getState(): Promise<PriceSyncState>;
  claimChunk(syncId: string, chunkToken: string): Promise<boolean>;
  releaseChunk(syncId: string, chunkToken: string): Promise<void>;
  stagePriceTypes(syncId: string, rows: PriceTypeStageRow[]): Promise<number>;
  stageCurrencies(syncId: string, rows: CurrencyStageRow[]): Promise<number>;
  stagePrices(syncId: string, rows: PriceRegisterStageRow[]): Promise<number>;
  checkpoint(syncId: string, input: { stage: PriceSyncStage; nextSkip: number; rowsScanned: number; rowsStaged: number; pageCompleted: boolean; scanComplete?: boolean }): Promise<void>;
  publish(syncId: string): Promise<void>;
  fail(syncId: string, category: string, stage: PriceSyncStage, page: number, databaseCode?: string): Promise<void>;
}

export class ChunkedPriceSyncService {
  constructor(private readonly provider: PriceChunkProvider, private readonly store: PriceSyncStateStore, private readonly now: () => number = Date.now) {}

  start() { return this.store.start(); }
  getState() { return this.store.getState(); }

  async continue(syncId: string): Promise<PriceSyncChunkResult> {
    let state = await this.store.getState();
    if (state.activeSyncId !== syncId || !["queued", "running"].includes(state.status)) return { state, needsContinuation: false, pagesProcessedThisInvocation: 0 };
    const chunkToken = crypto.randomUUID();
    if (!await this.store.claimChunk(syncId, chunkToken)) return { state: await this.store.getState(), needsContinuation: false, pagesProcessedThisInvocation: 0 };
    const started = this.now();
    let processed = 0;
    try {
      while (processed < PRICE_SYNC_PAGES_PER_INVOCATION && this.now() - started < PRICE_SYNC_DURATION_BUDGET_MS) {
        state = await this.store.getState();
        if (state.activeSyncId !== syncId || !state.currentStage) return { state, needsContinuation: false, pagesProcessedThisInvocation: processed };
        const processedStage = state.currentStage;
        const page = await this.fetchStagePage(processedStage, state.nextSkip, state.pageSize);
        const staged = await this.stagePage(syncId, processedStage, page.items);
        processed += 1;
        const complete = page.rowCount < state.pageSize;
        const nextStage = complete ? followingStage(processedStage) : processedStage;
        await this.store.checkpoint(syncId, { stage: nextStage, nextSkip: complete ? 0 : state.nextSkip + state.pageSize, rowsScanned: page.rowCount, rowsStaged: staged, pageCompleted: true, scanComplete: processedStage === "price_register_scan" && complete });
        if (processedStage === "price_register_scan" && complete) {
          await this.store.checkpoint(syncId, { stage: "price_publication", nextSkip: 0, rowsScanned: 0, rowsStaged: 0, pageCompleted: false, scanComplete: true });
          await this.store.publish(syncId);
          return { state: await this.store.getState(), needsContinuation: false, pagesProcessedThisInvocation: processed };
        }
      }
      await this.store.releaseChunk(syncId, chunkToken);
      return { state: await this.store.getState(), needsContinuation: true, pagesProcessedThisInvocation: processed };
    } catch (error) {
      const current = await this.store.getState();
      const stage = current.currentStage ?? "price_register_scan";
      await this.store.fail(syncId, errorCategory(error, stage), stage, current.pagesProcessed + 1, databaseCode(error));
      return { state: await this.store.getState(), needsContinuation: false, pagesProcessedThisInvocation: processed };
    }
  }

  private fetchStagePage(stage: PriceSyncStage, skip: number, limit: number) {
    if (stage === "price_type_scan") return this.provider.fetchPriceTypes(skip, limit);
    if (stage === "currency_scan") return this.provider.fetchCurrencies(skip, limit);
    if (stage === "price_register_scan") return this.provider.fetchPrices(skip, limit);
    throw new Error("Price sync stage cannot fetch pages.");
  }
  private stagePage(syncId: string, stage: PriceSyncStage, rows: PriceTypeStageRow[] | CurrencyStageRow[] | PriceRegisterStageRow[]) {
    if (stage === "price_type_scan") return this.store.stagePriceTypes(syncId, rows as PriceTypeStageRow[]);
    if (stage === "currency_scan") return this.store.stageCurrencies(syncId, rows as CurrencyStageRow[]);
    return this.store.stagePrices(syncId, rows as PriceRegisterStageRow[]);
  }
}

export class SupabasePriceSyncStateStore implements PriceSyncStateStore {
  async start() {
    const client = createAdminClient();
    const current = await this.getState();
    const stale = isPriceSyncLockStale(current, Date.now());
    if (["queued", "running"].includes(current.status) && !stale) return { state: current, started: false };
    const { data: catalog } = await client.from("catalog_sync_state").select("status").eq("id", "daily_catalog").maybeSingle();
    if (catalog?.status === "running") throw Object.assign(new Error("Catalog publication is active."), { errorCategory: "lock_conflict" });
    const syncId = crypto.randomUUID();
    await this.clearStages(current.activeSyncId);
    const now = new Date().toISOString();
    const { error } = await client.from("price_sync_state").update({ status: "queued", active_sync_id: syncId, started_at: now, finished_at: null, current_stage: "price_type_scan", next_skip: 0, page_size: PRICE_SYNC_PAGE_SIZE, pages_processed: 0, rows_scanned: 0, rows_staged: 0, latest_prices_resolved: 0, prices_published: 0, prices_deactivated: 0, unmatched_products: 0, unknown_price_types: 0, scan_complete: false, error_category: null, failed_stage: null, database_error_code: null, failed_page: null, lock_acquired_at: now, active_chunk_token: null, chunk_started_at: null, updated_at: now }).eq("id", "product_prices");
    if (error) throw persistenceError(error);
    return { state: await this.getState(), started: true };
  }
  async getState(): Promise<PriceSyncState> { const { data, error } = await createAdminClient().from("price_sync_state").select("*").eq("id", "product_prices").single(); if (error || !data) throw persistenceError(error); return mapState(data); }
  async claimChunk(syncId: string, chunkToken: string) { const { data, error } = await createAdminClient().rpc("claim_price_sync_chunk", { p_sync_id: syncId, p_chunk_token: chunkToken }); if (error) throw persistenceError(error); return data === true; }
  async releaseChunk(syncId: string, chunkToken: string) { const { error } = await createAdminClient().from("price_sync_state").update({ active_chunk_token: null, chunk_started_at: null, updated_at: new Date().toISOString() }).eq("id", "product_prices").eq("active_sync_id", syncId).eq("active_chunk_token", chunkToken); if (error) throw persistenceError(error); }
  async stagePriceTypes(syncId: string, rows: PriceTypeStageRow[]) { if (!rows.length) return 0; const { error } = await createAdminClient().from("product_price_type_sync_stage").upsert(rows.map((row) => ({ sync_id: syncId, external_ref: row.externalRef, external_code: row.externalCode, name: row.name, currency_ref: row.currencyRef, source_version: row.sourceVersion, is_active: row.isActive })), { onConflict: "sync_id,external_ref" }); if (error) throw persistenceError(error); return rows.length; }
  async stageCurrencies(syncId: string, rows: CurrencyStageRow[]) { if (!rows.length) return 0; const { error } = await createAdminClient().from("product_currency_sync_stage").upsert(rows.map((row) => ({ sync_id: syncId, external_ref: row.externalRef, code: row.code, name: row.name, is_active: row.isActive })), { onConflict: "sync_id,external_ref" }); if (error) throw persistenceError(error); return rows.length; }
  async stagePrices(syncId: string, rows: PriceRegisterStageRow[]) { if (!rows.length) return 0; const { data, error } = await createAdminClient().rpc("stage_product_price_rows", { p_sync_id: syncId, p_rows: rows.map((row) => ({ external_product_ref: row.externalProductRef, external_price_type_ref: row.externalPriceTypeRef, external_characteristic_ref: row.externalCharacteristicRef, amount: row.amount, is_current: row.isCurrent, effective_at: row.effectiveAt, currency_code: null, currency_status: "unresolved" })) }); if (error) throw persistenceError(error); return Number(data ?? 0); }
  async checkpoint(syncId: string, input: { stage: PriceSyncStage; nextSkip: number; rowsScanned: number; rowsStaged: number; pageCompleted: boolean; scanComplete?: boolean }) { const client = createAdminClient(); const state = await this.getState(); if (state.activeSyncId !== syncId) throw Object.assign(new Error("Stale price sync."), { errorCategory: "stale_job" }); const { error } = await client.from("price_sync_state").update({ status: "running", current_stage: input.stage, next_skip: input.nextSkip, pages_processed: state.pagesProcessed + (input.pageCompleted ? 1 : 0), rows_scanned: state.rowsScanned + input.rowsScanned, rows_staged: state.rowsStaged + input.rowsStaged, scan_complete: input.scanComplete ?? state.scanComplete, updated_at: new Date().toISOString() }).eq("id", "product_prices").eq("active_sync_id", syncId); if (error) throw persistenceError(error); }
  async publish(syncId: string) { const { error } = await createAdminClient().rpc("publish_product_price_snapshot", { p_sync_id: syncId }); if (error) throw Object.assign(persistenceError(error), { errorCategory: "publication_failure" }); }
  async fail(syncId: string, category: string, stage: PriceSyncStage, page: number, code?: string) { await createAdminClient().from("price_sync_state").update({ status: "failed", finished_at: new Date().toISOString(), error_category: category, failed_stage: stage, database_error_code: code ?? null, failed_page: page, active_sync_id: null, lock_acquired_at: null, active_chunk_token: null, chunk_started_at: null, updated_at: new Date().toISOString() }).eq("id", "product_prices").eq("active_sync_id", syncId); }
  private async clearStages(syncId: string | null) { if (!syncId) return; const client = createAdminClient(); await Promise.all([client.from("product_price_sync_stage").delete().eq("sync_id", syncId), client.from("product_price_type_sync_stage").delete().eq("sync_id", syncId), client.from("product_currency_sync_stage").delete().eq("sync_id", syncId)]); }
}

function followingStage(stage: PriceSyncStage): PriceSyncStage { if (stage === "price_type_scan") return "currency_scan"; if (stage === "currency_scan") return "price_register_scan"; if (stage === "price_register_scan") return "price_aggregation"; return stage; }
function errorCategory(error: unknown, stage: PriceSyncStage): string { if (isRecord(error) && typeof error.errorCategory === "string") return error.errorCategory; if (stage === "price_publication" || stage === "price_aggregation") return "publication_failure"; return "odata_failure"; }
function databaseCode(error: unknown): string | undefined { return isRecord(error) && typeof error.code === "string" ? error.code : undefined; }
function persistenceError(error: unknown): Error { const source = isRecord(error) ? error : {}; return Object.assign(new Error("Price synchronization persistence failed."), { name: "PriceSyncPersistenceError", errorCategory: "staging_failure", code: typeof source.code === "string" ? source.code : undefined }); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function mapState(row: Record<string, unknown>): PriceSyncState { return { status: row.status as PriceSyncStatus, activeSyncId: stringOrNull(row.active_sync_id), startedAt: stringOrNull(row.started_at), finishedAt: stringOrNull(row.finished_at), lastSuccessfulSyncAt: stringOrNull(row.last_successful_sync_at), currentStage: row.current_stage as PriceSyncStage | null, nextSkip: number(row.next_skip), pageSize: number(row.page_size), pagesProcessed: number(row.pages_processed), rowsScanned: number(row.rows_scanned), rowsStaged: number(row.rows_staged), latestPricesResolved: number(row.latest_prices_resolved), pricesPublished: number(row.prices_published), pricesDeactivated: number(row.prices_deactivated), unmatchedProducts: number(row.unmatched_products), unknownPriceTypes: number(row.unknown_price_types), scanComplete: row.scan_complete === true, errorCategory: stringOrNull(row.error_category), failedStage: stringOrNull(row.failed_stage), databaseErrorCode: stringOrNull(row.database_error_code), failedPage: typeof row.failed_page === "number" ? row.failed_page : null, updatedAt: String(row.updated_at) }; }
function stringOrNull(value: unknown): string | null { return typeof value === "string" ? value : null; }
function number(value: unknown): number { return typeof value === "number" ? value : 0; }
export function isPriceSyncLockStale(state: Pick<PriceSyncState, "status" | "updatedAt">, now: number): boolean { return state.status === "running" && Date.parse(state.updatedAt) < now - PRICE_SYNC_STALE_LOCK_MS; }

import "server-only";

import { createHash } from "node:crypto";

import { createAdminClient } from "../../../lib/supabase/admin";
import { IntegrationProviderUnavailableError, IntegrationTimeoutError } from "../errors";
import { getOneCSafeDiagnostic, type CurrencyStageRow, type PriceChunkProvider, type PricePageIntegrity, type PriceRegisterStageRow, type PriceSyncPage, type PriceTypeStageRow } from "../providers/one-c";
import { normalizePricePage, type PricePageDiagnostics } from "./price-page-normalization";
import { projectPartnerProductTransitions } from "./product-notification-projection";
import type { CatalogProjectionOutcome, CatalogSynchronizationOrchestrator, CatalogSynchronizationTrigger } from "./catalog-synchronization-orchestrator";

export const PRICE_SYNC_PAGE_SIZE = 500;
export const PRICE_SYNC_PAGES_PER_INVOCATION = 5;
export const PRICE_SYNC_DURATION_BUDGET_MS = 45_000;
export const PRICE_SYNC_STALE_LOCK_MS = 10 * 60 * 1000;
export const PRICE_SYNC_MAX_PAGE_RETRIES = 3;
export const PRICE_SYNC_RETRY_DELAY_BUDGET_MS = 15_000;
const RETAIL_PRICE_TYPE_REF = "e181c772-93fc-11e9-94cb-000c2988d323";
const ZERO_CHARACTERISTIC_REF = "00000000-0000-0000-0000-000000000000";

export type PriceSyncStatus = "never_run" | "queued" | "running" | "succeeded" | "failed";
export type PriceSyncStage = "price_type_scan" | "currency_scan" | "price_register_scan" | "price_aggregation" | "price_publication" | "continuation_launch" | "completed";
export type PriceSyncState = { status: PriceSyncStatus; activeSyncId: string | null; lastFailedSyncId: string | null; startedAt: string | null; finishedAt: string | null; lastSuccessfulSyncAt: string | null; currentStage: PriceSyncStage | null; nextSkip: number; pageSize: number; pagesProcessed: number; rowsScanned: number; rowsStaged: number; priceRowsReceived: number; priceUniqueKeys: number; priceDuplicateKeys: number; priceRowsDeduplicated: number; latestPricesResolved: number; pricesPublished: number; pricesDeactivated: number; unmatchedProducts: number; unknownPriceTypes: number; scanComplete: boolean; errorCategory: string | null; failedStage: string | null; databaseErrorCode: string | null; safeError: string | null; failedPage: number | null; activeChunkToken: string | null; chunkStartedAt: string | null; lastPageStage: PriceSyncStage | null; lastPageNumber: number | null; lastPageFingerprint: string | null; lastPageFirstKey: string | null; lastPageLastKey: string | null; retryCount: number; odataRequestCount: number; odataRequestDurationMs: number; odataRequestDurationsMs: number[]; stagingDurationMs: number; validationDurationMs: number; publicationDurationMs: number; continuationCount: number; updatedAt: string };
export type PriceSyncChunkResult = { state: PriceSyncState; needsContinuation: boolean; pagesProcessedThisInvocation: number; projection?: CatalogProjectionOutcome | null };

export interface PriceSyncStateStore {
  start(): Promise<{ state: PriceSyncState; started: boolean }>;
  getState(): Promise<PriceSyncState>;
  claimChunk(syncId: string, chunkToken: string): Promise<boolean>;
  releaseChunk(syncId: string, chunkToken: string): Promise<void>;
  stagePriceTypes(syncId: string, rows: PriceTypeStageRow[]): Promise<number>;
  stageCurrencies(syncId: string, rows: CurrencyStageRow[]): Promise<number>;
  stagePrices(syncId: string, rows: PriceRegisterStageRow[]): Promise<number>;
  stageRetailHistory?(syncId: string, rows: PriceRegisterStageRow[], sourceOffset: number): Promise<number>;
  checkpoint(syncId: string, input: { stage: PriceSyncStage; processedStage?: PriceSyncStage; pageNumber?: number; pageIntegrity?: PricePageIntegrity; nextSkip: number; rowsScanned: number; rowsStaged: number; pageCompleted: boolean; scanComplete?: boolean; priceDiagnostics?: PricePageDiagnostics; retryCount?: number; requestCount?: number; requestDurationMs?: number; requestDurationsMs?: number[]; stagingDurationMs?: number }): Promise<void>;
  publish(syncId: string): Promise<void>;
  fail(syncId: string, category: string, stage: PriceSyncStage, page: number, databaseCode?: string, safeError?: string): Promise<void>;
  failLaunch(syncId: string, safeError: string): Promise<void>;
}

export class ChunkedPriceSyncService {
  private readonly retry: { maxRetries: number; sleep: (ms: number) => Promise<void>; random: () => number };
  constructor(private readonly provider: PriceChunkProvider, private readonly store: PriceSyncStateStore, private readonly now: () => number = Date.now, retry: Partial<{ maxRetries: number; sleep: (ms: number) => Promise<void>; random: () => number }> = {}, private readonly orchestrator?: CatalogSynchronizationOrchestrator) {
    this.retry = { maxRetries: retry.maxRetries ?? PRICE_SYNC_MAX_PAGE_RETRIES, sleep: retry.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))), random: retry.random ?? Math.random };
  }

  async start(trigger: CatalogSynchronizationTrigger = "scheduled") { const result = await this.store.start(); if (result.started && result.state.activeSyncId) { try { await this.orchestrator?.registerSourceRun(result.state.activeSyncId, "prices", trigger); } catch (error) { await this.store.failLaunch(result.state.activeSyncId, "Synchronization audit registration failed."); throw error; } console.info(observation("price_sync_started", result.state.activeSyncId, result.state.currentStage)); } return result; }
  getState() { return this.store.getState(); }
  resumePendingProjection() { return this.orchestrator?.resumePendingProjection() ?? Promise.resolve(null); }
  async failLaunch(syncId: string, safeError: string) { await this.store.failLaunch(syncId, safeError); await this.orchestrator?.failSourceSync(syncId, "prices", "CONTINUATION_LAUNCH_FAILED"); }

  async continue(syncId: string): Promise<PriceSyncChunkResult> {
    let state = await this.store.getState();
    if (state.activeSyncId !== syncId || !["queued", "running"].includes(state.status)) return { state, needsContinuation: false, pagesProcessedThisInvocation: 0 };
    const chunkToken = crypto.randomUUID();
    if (!await this.store.claimChunk(syncId, chunkToken)) return { state: await this.store.getState(), needsContinuation: false, pagesProcessedThisInvocation: 0 };
    console.info({ event: "price_sync_chunk_claimed", syncId, stage: state.currentStage, nextSkip: state.nextSkip, pagesProcessed: state.pagesProcessed, rowsScanned: state.rowsScanned });
    const started = this.now();
    let processed = 0;
    try {
      while (processed < PRICE_SYNC_PAGES_PER_INVOCATION && this.now() - started < PRICE_SYNC_DURATION_BUDGET_MS) {
        state = await this.store.getState();
        if (state.activeSyncId !== syncId || !state.currentStage) return { state, needsContinuation: false, pagesProcessedThisInvocation: processed };
        const processedStage = state.currentStage;
        const pageNumber = state.pagesProcessed + 1;
        const entityPage = Math.floor(state.nextSkip / state.pageSize) + 1;
        const fetched = await this.fetchPageWithRetry(syncId, processedStage, pageNumber, entityPage, state.nextSkip, state.pageSize);
        const page = fetched.page;
        assertPageIntegrity(state, processedStage, pageNumber, page);
        const normalizedPricePage = processedStage === "price_register_scan" ? normalizePricePage(page.items as PriceRegisterStageRow[]) : null;
        const stagingStartedAt = performance.now();
        const staged = await this.stagePage(syncId, processedStage, (normalizedPricePage?.rows ?? page.items) as PriceTypeStageRow[] | CurrencyStageRow[] | PriceRegisterStageRow[]);
        if (processedStage === "price_register_scan" && this.store.stageRetailHistory) {
          await this.store.stageRetailHistory(
            syncId,
            page.items as PriceRegisterStageRow[],
            state.nextSkip,
          );
        }
        const stagingDurationMs = Math.round(performance.now() - stagingStartedAt);
        processed += 1;
        const complete = page.rowCount < state.pageSize;
        const nextStage = complete ? followingStage(processedStage) : processedStage;
        await this.store.checkpoint(syncId, { stage: nextStage, processedStage, pageNumber, pageIntegrity: page.integrity, nextSkip: complete ? 0 : state.nextSkip + state.pageSize, rowsScanned: page.rowCount, rowsStaged: staged, pageCompleted: true, scanComplete: processedStage === "price_register_scan" && complete, priceDiagnostics: normalizedPricePage?.diagnostics, retryCount: fetched.retryCount, requestCount: fetched.retryCount + 1, requestDurationMs: sum(fetched.requestDurationsMs), requestDurationsMs: fetched.requestDurationsMs, stagingDurationMs });
        console.info(observation("price_sync_page_completed", syncId, processedStage, { entity: stageEntity(processedStage), page: pageNumber, entityPage, rows: page.rowCount, cumulativeRows: state.rowsScanned + page.rowCount, durationMs: fetched.durationMs, retryCount: fetched.retryCount, firstStableKey: page.integrity.firstStableKey, lastStableKey: page.integrity.lastStableKey, duplicatesDiscarded: normalizedPricePage?.diagnostics.rowsDeduplicated ?? 0 }));
        if (processedStage === "price_register_scan" && complete) {
          console.info(observation("price_sync_scan_completed", syncId, processedStage, { rows: page.rowCount, cumulativeRows: state.rowsScanned + page.rowCount }));
          console.info(observation("price_sync_validation_completed", syncId, "price_aggregation", { cumulativeRows: state.rowsScanned + page.rowCount }));
          await this.store.checkpoint(syncId, { stage: "price_publication", nextSkip: 0, rowsScanned: 0, rowsStaged: 0, pageCompleted: false, scanComplete: true });
          console.info(observation("price_sync_publication_started", syncId, "price_publication"));
          await this.store.publish(syncId);
          const completedState = await this.store.getState();
          console.info(observation("price_sync_publication_completed", syncId, "completed", { rows: completedState.pricesPublished, durationMs: completedState.publicationDurationMs }));
          console.info({ event: "price_sync_chunk_completed", syncId, stage: completedState.currentStage, nextSkip: completedState.nextSkip, pagesProcessed: completedState.pagesProcessed, rowsScanned: completedState.rowsScanned });
          const projection = await this.completeOrchestration(syncId, completedState);
          return { state: completedState, needsContinuation: false, pagesProcessedThisInvocation: processed, projection };
        }
      }
      await this.store.releaseChunk(syncId, chunkToken);
      const continuedState = await this.store.getState();
      console.info({ event: "price_sync_chunk_completed", syncId, stage: continuedState.currentStage, nextSkip: continuedState.nextSkip, pagesProcessed: continuedState.pagesProcessed, rowsScanned: continuedState.rowsScanned });
      console.info({ event: "price_sync_continuation_accepted", syncId, stage: continuedState.currentStage, nextSkip: continuedState.nextSkip, pagesProcessed: continuedState.pagesProcessed, rowsScanned: continuedState.rowsScanned });
      return { state: continuedState, needsContinuation: true, pagesProcessedThisInvocation: processed };
    } catch (error) {
      const current = await this.store.getState();
      const stage = current.currentStage ?? "price_register_scan";
      await this.store.fail(syncId, errorCategory(error, stage), stage, current.pagesProcessed + 1, databaseCode(error), safeIntegrationError(error));
      console.error(observation("price_sync_failed", syncId, stage, { page: current.pagesProcessed + 1, nextSkip: current.nextSkip, pagesProcessed: current.pagesProcessed, cumulativeRows: current.rowsScanned, safeError: safeIntegrationError(error), errorCategory: errorCategory(error, stage) }));
      const failedState = await this.store.getState();
      await this.orchestrator?.failSourceSync(syncId, "prices", errorCategory(error, stage));
      return { state: failedState, needsContinuation: false, pagesProcessedThisInvocation: processed, projection: null };
    }
  }

  private completeOrchestration(syncId: string, state: PriceSyncState) {
    if (!this.orchestrator) return Promise.resolve(null);
    return this.orchestrator.completeSourceSync({
      sourceSyncId: syncId,
      sourceDomain: "prices",
      changedCounts: {
        prices: state.pricesPublished,
        deactivated: state.pricesDeactivated,
        unmatchedProducts: state.unmatchedProducts,
        unknownPriceTypes: state.unknownPriceTypes,
      },
      sourceDurationMs: durationBetween(state.startedAt, state.finishedAt),
    });
  }

  private async fetchPageWithRetry(syncId: string, stage: PriceSyncStage, page: number, entityPage: number, skip: number, limit: number): Promise<{ page: PriceSyncPage<PriceTypeStageRow | CurrencyStageRow | PriceRegisterStageRow>; retryCount: number; durationMs: number; requestDurationsMs: number[] }> {
    const startedAt = performance.now();
    let totalDelayMs = 0;
    const requestDurationsMs: number[] = [];
    console.info(observation("price_sync_page_started", syncId, stage, { entity: stageEntity(stage), page, entityPage, skip }));
    for (let attempt = 0; ; attempt += 1) {
      const requestStartedAt = performance.now();
      try {
        const page = await this.fetchStagePage(stage, skip, limit);
        requestDurationsMs.push(Math.round(performance.now() - requestStartedAt));
        return { page, retryCount: attempt, durationMs: Math.round(performance.now() - startedAt), requestDurationsMs };
      } catch (error) {
        requestDurationsMs.push(Math.round(performance.now() - requestStartedAt));
        if (attempt >= this.retry.maxRetries || !isRetryablePageError(error)) throw error;
        const diagnostic = getOneCSafeDiagnostic(error);
        const delayMs = retryDelayMs(attempt, diagnostic?.retryAfterMs ?? null, this.retry.random());
        if (totalDelayMs + delayMs > PRICE_SYNC_RETRY_DELAY_BUDGET_MS) throw error;
        totalDelayMs += delayMs;
        console.warn(observation("price_sync_page_retry", syncId, stage, { entity: stageEntity(stage), page, entityPage, retryAttempt: attempt + 1, delayMs, httpStatus: diagnostic?.statusCode ?? null, responseContentType: diagnostic?.receivedContentType ?? null, safeError: safeIntegrationError(error), requestDurationMs: Math.round(performance.now() - startedAt), upstreamConnectTimeMs: diagnostic?.upstreamConnectTimeMs ?? null, upstreamHeaderTimeMs: diagnostic?.upstreamHeaderTimeMs ?? null, upstreamResponseTimeMs: diagnostic?.upstreamResponseTimeMs ?? null, responseServer: diagnostic?.responseServer ?? null }));
        await this.retry.sleep(delayMs);
      }
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
    await this.clearStages(current.activeSyncId ?? current.lastFailedSyncId);
    const now = new Date().toISOString();
    const { error } = await client.from("price_sync_state").update({ status: "queued", active_sync_id: syncId, last_failed_sync_id: null, started_at: now, finished_at: null, current_stage: "price_type_scan", next_skip: 0, page_size: PRICE_SYNC_PAGE_SIZE, pages_processed: 0, rows_scanned: 0, rows_staged: 0, price_rows_received: 0, price_unique_keys: 0, price_duplicate_keys: 0, price_rows_deduplicated: 0, latest_prices_resolved: 0, prices_published: 0, prices_deactivated: 0, unmatched_products: 0, unknown_price_types: 0, scan_complete: false, error_category: null, failed_stage: null, database_error_code: null, safe_error: null, failed_page: null, last_page_stage: null, last_page_number: null, last_page_fingerprint: null, last_page_first_key: null, last_page_last_key: null, retry_count: 0, odata_request_count: 0, odata_request_duration_ms: 0, odata_request_durations_ms: [], staging_duration_ms: 0, validation_duration_ms: 0, publication_duration_ms: 0, continuation_count: 0, lock_acquired_at: now, active_chunk_token: null, chunk_started_at: null, updated_at: now }).eq("id", "product_prices");
    if (error) throw persistenceError(error);
    return { state: await this.getState(), started: true };
  }
  async getState(): Promise<PriceSyncState> { const { data, error } = await createAdminClient().from("price_sync_state").select("*").eq("id", "product_prices").single(); if (error || !data) throw persistenceError(error); return mapState(data); }
  async claimChunk(syncId: string, chunkToken: string) { const { data, error } = await createAdminClient().rpc("claim_price_sync_chunk", { p_sync_id: syncId, p_chunk_token: chunkToken }); if (error) throw persistenceError(error); return data === true; }
  async releaseChunk(syncId: string, chunkToken: string) { const { error } = await createAdminClient().from("price_sync_state").update({ active_chunk_token: null, chunk_started_at: null, updated_at: new Date().toISOString() }).eq("id", "product_prices").eq("active_sync_id", syncId).eq("active_chunk_token", chunkToken); if (error) throw persistenceError(error); }
  async stagePriceTypes(syncId: string, rows: PriceTypeStageRow[]) { if (!rows.length) return 0; const { error } = await createAdminClient().from("product_price_type_sync_stage").upsert(rows.map((row) => ({ sync_id: syncId, external_ref: row.externalRef, external_code: row.externalCode, name: row.name, currency_ref: row.currencyRef, source_version: row.sourceVersion, is_active: row.isActive })), { onConflict: "sync_id,external_ref" }); if (error) throw persistenceError(error); return rows.length; }
  async stageCurrencies(syncId: string, rows: CurrencyStageRow[]) { if (!rows.length) return 0; const { error } = await createAdminClient().from("product_currency_sync_stage").upsert(rows.map((row) => ({ sync_id: syncId, external_ref: row.externalRef, code: row.code, name: row.name, is_active: row.isActive })), { onConflict: "sync_id,external_ref" }); if (error) throw persistenceError(error); return rows.length; }
  async stagePrices(syncId: string, rows: PriceRegisterStageRow[]) { if (!rows.length) return 0; const { data, error } = await createAdminClient().rpc("stage_product_price_rows", { p_sync_id: syncId, p_rows: rows.map((row) => ({ external_product_ref: row.externalProductRef, external_price_type_ref: row.externalPriceTypeRef, external_characteristic_ref: row.externalCharacteristicRef, amount: row.amount, is_current: row.isCurrent, effective_at: row.effectiveAt, currency_code: null, currency_status: "unresolved" })) }); if (error) throw persistenceError(error); return Number(data ?? 0); }
  async stageRetailHistory(syncId: string, rows: PriceRegisterStageRow[], sourceOffset: number) {
    const retailRows = rows
      .map((row, index) => ({ row, sourceOrdinal: sourceOffset + index }))
      .filter(({ row }) =>
        row.externalPriceTypeRef === RETAIL_PRICE_TYPE_REF
        && row.externalCharacteristicRef === ZERO_CHARACTERISTIC_REF
        && row.amount >= 0
        && Number.isFinite(Date.parse(row.effectiveAt)));
    if (!retailRows.length) return 0;
    const { error } = await createAdminClient().from("retail_price_history_source_stage").upsert(
      retailRows.map(({ row, sourceOrdinal }) => ({
        sync_id: syncId,
        external_product_ref: row.externalProductRef,
        external_price_type_ref: row.externalPriceTypeRef,
        external_characteristic_ref: row.externalCharacteristicRef,
        price_amount: row.amount,
        effective_at: row.effectiveAt,
        is_current: row.isCurrent,
        source_ordinal: sourceOrdinal,
        source_fingerprint: createHash("sha256").update([
          row.externalProductRef,
          row.externalPriceTypeRef,
          row.externalCharacteristicRef,
          row.effectiveAt,
          String(row.amount),
          String(row.isCurrent),
        ].join("|")).digest("hex"),
      })),
      { onConflict: "sync_id,source_fingerprint" },
    );
    if (error) throw persistenceError(error);
    return retailRows.length;
  }
  async checkpoint(syncId: string, input: { stage: PriceSyncStage; processedStage?: PriceSyncStage; pageNumber?: number; pageIntegrity?: PricePageIntegrity; nextSkip: number; rowsScanned: number; rowsStaged: number; pageCompleted: boolean; scanComplete?: boolean; priceDiagnostics?: PricePageDiagnostics; retryCount?: number; requestCount?: number; requestDurationMs?: number; requestDurationsMs?: number[]; stagingDurationMs?: number }) { const client = createAdminClient(); const state = await this.getState(); if (state.activeSyncId !== syncId) throw Object.assign(new Error("Stale price sync."), { errorCategory: "stale_job" }); const d = input.priceDiagnostics; const { error } = await client.from("price_sync_state").update({ status: "running", current_stage: input.stage, next_skip: input.nextSkip, pages_processed: state.pagesProcessed + (input.pageCompleted ? 1 : 0), rows_scanned: state.rowsScanned + input.rowsScanned, rows_staged: state.rowsStaged + input.rowsStaged, price_rows_received: state.priceRowsReceived + (d?.received ?? 0), price_unique_keys: state.priceUniqueKeys + (d?.uniqueKeys ?? 0), price_duplicate_keys: state.priceDuplicateKeys + (d?.duplicateKeys ?? 0), price_rows_deduplicated: state.priceRowsDeduplicated + (d?.rowsDeduplicated ?? 0), scan_complete: input.scanComplete ?? state.scanComplete, last_page_stage: input.pageCompleted ? input.processedStage : state.lastPageStage, last_page_number: input.pageCompleted ? input.pageNumber : state.lastPageNumber, last_page_fingerprint: input.pageCompleted ? input.pageIntegrity?.fingerprint : state.lastPageFingerprint, last_page_first_key: input.pageCompleted ? input.pageIntegrity?.firstStableKey : state.lastPageFirstKey, last_page_last_key: input.pageCompleted ? input.pageIntegrity?.lastStableKey : state.lastPageLastKey, retry_count: state.retryCount + (input.retryCount ?? 0), odata_request_count: state.odataRequestCount + (input.requestCount ?? 0), odata_request_duration_ms: state.odataRequestDurationMs + (input.requestDurationMs ?? 0), odata_request_durations_ms: [...state.odataRequestDurationsMs, ...(input.requestDurationsMs ?? [])], staging_duration_ms: state.stagingDurationMs + (input.stagingDurationMs ?? 0), updated_at: new Date().toISOString() }).eq("id", "product_prices").eq("active_sync_id", syncId); if (error) throw persistenceError(error); }
  async publish(syncId: string) {
    const client = createAdminClient();
    const validationStartedAt = performance.now();
    const discovery = await client.rpc("record_retail_price_history_discovery", { p_sync_id: syncId });
    if (discovery.error) throw Object.assign(persistenceError(discovery.error), { errorCategory: "publication_failure" });
    const validationDurationMs = Math.round(performance.now() - validationStartedAt);
    const publicationStartedAt = performance.now();
    const { error } = await client.rpc("publish_product_prices_with_retail_history", { p_sync_id: syncId });
    if (error) throw Object.assign(persistenceError(error), { errorCategory: "publication_failure" });
    await projectPartnerProductTransitions(syncId);
    await client.from("retail_price_history_source_stage").delete().eq("sync_id", syncId);
    const publicationDurationMs = Math.round(performance.now() - publicationStartedAt);
    await client.from("price_sync_state").update({ validation_duration_ms: validationDurationMs, publication_duration_ms: publicationDurationMs }).eq("id", "product_prices");
    const state = await this.getState();
    const remote = durationMetrics(state.odataRequestDurationsMs);
    const totalWallClockMs = state.startedAt && state.finishedAt ? Math.max(0, Date.parse(state.finishedAt) - Date.parse(state.startedAt)) : 0;
    const { error: metricsError } = await client.from("price_sync_run_metrics").upsert({ sync_id: syncId, started_at: state.startedAt, finished_at: state.finishedAt, total_remote_requests: state.odataRequestCount, successful_remote_requests: state.pagesProcessed, retry_remote_requests: state.retryCount, average_remote_duration_ms: remote.average, p50_remote_duration_ms: remote.p50, p95_remote_duration_ms: remote.p95, max_remote_duration_ms: remote.max, staging_duration_ms: state.stagingDurationMs, validation_duration_ms: validationDurationMs, publication_duration_ms: publicationDurationMs, total_processing_duration_ms: state.odataRequestDurationMs + state.stagingDurationMs + validationDurationMs + publicationDurationMs, total_wall_clock_duration_ms: totalWallClockMs, continuation_count: state.continuationCount }, { onConflict: "sync_id" });
    if (metricsError) console.warn(observation("price_sync_metrics_persistence_warning", syncId, "completed", { databaseCode: metricsError.code ?? null }));
  }
  async fail(syncId: string, category: string, stage: PriceSyncStage, page: number, code?: string, safeError?: string) {
    const client = createAdminClient();
    const now = new Date().toISOString();
    await Promise.all([
      client.from("price_sync_state").update({ status: "failed", finished_at: now, error_category: category, failed_stage: stage, database_error_code: code ?? null, safe_error: safeError ?? null, failed_page: page, last_failed_sync_id: syncId, active_sync_id: null, lock_acquired_at: null, active_chunk_token: null, chunk_started_at: null, updated_at: now }).eq("id", "product_prices").eq("active_sync_id", syncId),
      client.from("retail_price_history_backfill_runs").update({ status: "failed", finished_at: now, error_code: code ?? null, safe_error: safeError ?? "RETAIL_HISTORY_SOURCE_QUERY_FAILED", updated_at: now }).eq("sync_id", syncId).in("status", ["requested", "running"]),
    ]);
  }
  async failLaunch(syncId: string, safeError: string) {
    const client = createAdminClient();
    const now = new Date().toISOString();
    await Promise.all([
      client.from("price_sync_state").update({ status: "failed", finished_at: now, error_category: "orchestration_failure", failed_stage: "continuation_launch", safe_error: safeError, active_sync_id: null, lock_acquired_at: null, active_chunk_token: null, chunk_started_at: null, updated_at: now }).eq("id", "product_prices").eq("active_sync_id", syncId),
      client.from("retail_price_history_backfill_runs").update({ status: "failed", finished_at: now, safe_error: "RETAIL_HISTORY_SOURCE_QUERY_FAILED", updated_at: now }).eq("sync_id", syncId).in("status", ["requested", "running"]),
    ]);
  }
  private async clearStages(syncId: string | null) { if (!syncId) return; const client = createAdminClient(); await Promise.all([client.from("product_price_sync_stage").delete().eq("sync_id", syncId), client.from("product_price_type_sync_stage").delete().eq("sync_id", syncId), client.from("product_currency_sync_stage").delete().eq("sync_id", syncId), client.from("retail_price_history_source_stage").delete().eq("sync_id", syncId)]); }
}

function followingStage(stage: PriceSyncStage): PriceSyncStage { if (stage === "price_type_scan") return "currency_scan"; if (stage === "currency_scan") return "price_register_scan"; if (stage === "price_register_scan") return "price_aggregation"; return stage; }
function stageEntity(stage: PriceSyncStage): string | null { if (stage === "price_type_scan") return "Catalog_\u0412\u0438\u0434\u044b\u0426\u0435\u043d"; if (stage === "currency_scan") return "Catalog_\u0412\u0430\u043b\u044e\u0442\u044b"; if (stage === "price_register_scan") return "InformationRegister_\u0426\u0435\u043d\u044b\u041d\u043e\u043c\u0435\u043d\u043a\u043b\u0430\u0442\u0443\u0440\u044b"; return null; }
function assertPageIntegrity(state: PriceSyncState, stage: PriceSyncStage, pageNumber: number, page: PriceSyncPage<unknown>): void {
  if (page.rowCount > state.pageSize || page.items.length !== page.rowCount) throw integrityFailure("Price page row count is inconsistent.");
  if (state.lastPageStage !== stage) return;
  if (state.lastPageNumber !== pageNumber - 1) throw integrityFailure("Price page sequence contains a missing range.");
  if (page.rowCount > 0 && state.lastPageFingerprint === page.integrity.fingerprint) throw integrityFailure("Price scan returned a repeated page.");
}
function integrityFailure(message: string): Error { return Object.assign(new Error(message), { name: "PriceSyncPageIntegrityError", errorCategory: "page_integrity_failure", safeError: message }); }
function isRetryablePageError(error: unknown): boolean {
  if (error instanceof IntegrationTimeoutError) return true;
  if (error instanceof IntegrationProviderUnavailableError) return isRecord(error) && typeof error.networkCode === "string" && ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EPIPE", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT"].includes(error.networkCode);
  const status = getOneCSafeDiagnostic(error)?.statusCode;
  return status !== null && status !== undefined && [429, 500, 502, 503, 504].includes(status);
}
function retryDelayMs(retryIndex: number, retryAfterMs: number | null, random: number): number {
  const base = [500, 1_500, 3_000][retryIndex] ?? 3_000;
  return Math.min(30_000, Math.max(retryAfterMs ?? 0, base + Math.round(base * 0.2 * Math.max(0, Math.min(1, random)))));
}
function safeIntegrationError(error: unknown): string | undefined {
  const diagnostic = getOneCSafeDiagnostic(error);
  if (diagnostic) return [`status=${diagnostic.statusCode ?? "network"}`, diagnostic.safeErrorSummary].filter(Boolean).join(" ").slice(0, 300);
  if (isRecord(error) && typeof error.safeError === "string") return sanitizeDatabaseField(error.safeError);
  if (error instanceof IntegrationTimeoutError) return "1C OData request timed out.";
  if (error instanceof IntegrationProviderUnavailableError) return "1C OData connection failed.";
  return safeDatabaseError(error);
}
function observation(event: string, syncId: string | null, stage: PriceSyncStage | null, details: Record<string, unknown> = {}) { return { event, syncId, stage, correlationId: syncId, deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local", ...details }; }
function errorCategory(error: unknown, stage: PriceSyncStage): string { if (isRecord(error) && typeof error.errorCategory === "string") return error.errorCategory; if (stage === "price_publication" || stage === "price_aggregation") return "publication_failure"; return "odata_failure"; }
function databaseCode(error: unknown): string | undefined { return isRecord(error) && typeof error.code === "string" ? error.code : undefined; }
function persistenceError(error: unknown): Error { const source = isRecord(error) ? error : {}; return Object.assign(new Error("Price synchronization persistence failed."), { name: "PriceSyncPersistenceError", errorCategory: "staging_failure", code: stringValue(source.code), databaseMessage: sanitizeDatabaseField(source.message), databaseDetails: sanitizeDatabaseField(source.details), databaseHint: sanitizeDatabaseField(source.hint) }); }
function safeDatabaseError(error: unknown): string | undefined { if (!isRecord(error)) return undefined; const fields = [error.databaseMessage, error.databaseDetails, error.databaseHint].filter((value): value is string => typeof value === "string" && value.length > 0); return fields.length ? fields.join(" ").slice(0, 500) : undefined; }
function sanitizeDatabaseField(value: unknown): string | undefined { if (typeof value !== "string" || !value.trim()) return undefined; return value.trim().replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "[redacted]").replace(/'[^']*'/g, "'[redacted]'").replace(/\b\d+(?:\.\d+)?\b/g, "[number]").slice(0, 180); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function mapState(row: Record<string, unknown>): PriceSyncState { return { status: row.status as PriceSyncStatus, activeSyncId: stringOrNull(row.active_sync_id), lastFailedSyncId: stringOrNull(row.last_failed_sync_id), startedAt: stringOrNull(row.started_at), finishedAt: stringOrNull(row.finished_at), lastSuccessfulSyncAt: stringOrNull(row.last_successful_sync_at), currentStage: row.current_stage as PriceSyncStage | null, nextSkip: number(row.next_skip), pageSize: number(row.page_size), pagesProcessed: number(row.pages_processed), rowsScanned: number(row.rows_scanned), rowsStaged: number(row.rows_staged), priceRowsReceived: number(row.price_rows_received), priceUniqueKeys: number(row.price_unique_keys), priceDuplicateKeys: number(row.price_duplicate_keys), priceRowsDeduplicated: number(row.price_rows_deduplicated), latestPricesResolved: number(row.latest_prices_resolved), pricesPublished: number(row.prices_published), pricesDeactivated: number(row.prices_deactivated), unmatchedProducts: number(row.unmatched_products), unknownPriceTypes: number(row.unknown_price_types), scanComplete: row.scan_complete === true, errorCategory: stringOrNull(row.error_category), failedStage: stringOrNull(row.failed_stage), databaseErrorCode: stringOrNull(row.database_error_code), safeError: stringOrNull(row.safe_error), failedPage: typeof row.failed_page === "number" ? row.failed_page : null, activeChunkToken: stringOrNull(row.active_chunk_token), chunkStartedAt: stringOrNull(row.chunk_started_at), lastPageStage: row.last_page_stage as PriceSyncStage | null, lastPageNumber: typeof row.last_page_number === "number" ? row.last_page_number : null, lastPageFingerprint: stringOrNull(row.last_page_fingerprint), lastPageFirstKey: stringOrNull(row.last_page_first_key), lastPageLastKey: stringOrNull(row.last_page_last_key), retryCount: number(row.retry_count), odataRequestCount: number(row.odata_request_count), odataRequestDurationMs: number(row.odata_request_duration_ms), odataRequestDurationsMs: numberArray(row.odata_request_durations_ms), stagingDurationMs: number(row.staging_duration_ms), validationDurationMs: number(row.validation_duration_ms), publicationDurationMs: number(row.publication_duration_ms), continuationCount: number(row.continuation_count), updatedAt: String(row.updated_at) }; }
function stringOrNull(value: unknown): string | null { return typeof value === "string" ? value : null; }
function stringValue(value: unknown): string | undefined { return typeof value === "string" && value ? value : undefined; }
function number(value: unknown): number { return typeof value === "number" ? value : 0; }
function numberArray(value: unknown): number[] { return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number" && item >= 0) : []; }
function durationBetween(startedAt: string | null, finishedAt: string | null): number { const start = startedAt ? Date.parse(startedAt) : Number.NaN; const finish = finishedAt ? Date.parse(finishedAt) : Date.now(); return Number.isFinite(start) && Number.isFinite(finish) ? Math.max(0, finish - start) : 0; }
function sum(values: number[]): number { return values.reduce((total, value) => total + value, 0); }
export function durationMetrics(values: number[]): { average: number; p50: number; p95: number; max: number } { const sorted = [...values].sort((left, right) => left - right); if (!sorted.length) return { average: 0, p50: 0, p95: 0, max: 0 }; const percentile = (value: number) => sorted[Math.max(0, Math.ceil(sorted.length * value) - 1)] ?? 0; return { average: Math.round(sum(sorted) / sorted.length), p50: percentile(0.5), p95: percentile(0.95), max: sorted[sorted.length - 1] ?? 0 }; }
export function isPriceSyncLockStale(state: Pick<PriceSyncState, "status" | "updatedAt">, now: number): boolean { return state.status === "running" && Date.parse(state.updatedAt) < now - PRICE_SYNC_STALE_LOCK_MS; }

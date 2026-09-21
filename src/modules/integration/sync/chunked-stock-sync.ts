import "server-only";

import { createAdminClient } from "../../../lib/supabase/admin";
import { IntegrationProviderUnavailableError, IntegrationTimeoutError } from "../errors";
import {
  getOneCSafeDiagnostic,
  ONE_C_STOCK_BALANCE_RESOURCES,
  ONE_C_SUPPLIER_ARRIVAL_RESOURCES,
  type StockBalanceKind,
  type StockBalanceProvider,
  type StockStageRow,
  type StockWarehouseRow,
  type SupplierArrivalProvider,
  type SupplierBalanceRow,
  type SupplierOrderDocumentRow,
} from "../providers/one-c";
import type { CatalogProjectionOutcome, CatalogSynchronizationOrchestrator, CatalogSynchronizationTrigger } from "./catalog-synchronization-orchestrator";
import { projectPartnerProductTransitions } from "./product-notification-projection";

export const STOCK_SYNC_MAX_SOURCE_RETRIES = 3;
export const STOCK_SYNC_RETRY_DELAY_BUDGET_MS = 15_000;
const MAX_PAGES = 5;
const BUDGET_MS = 45_000;

export type StockSyncStatus = "never_run" | "queued" | "running" | "succeeded" | "failed";
export type StockSyncTrigger = CatalogSynchronizationTrigger | "watchdog";
export type StockSyncStage = "warehouse_scan" | "physical_scan" | "reserved_scan" | "incoming_scan" | "supplier_arrival_balance" | "supplier_order_documents" | "stock_publication" | "continuation_launch" | "completed";
export type StockSyncState = {
  status: StockSyncStatus;
  activeSyncId: string | null;
  lastFailedSyncId: string | null;
  snapshotTime: string | null;
  currentStage: StockSyncStage | null;
  nextSkip: number;
  pageSize: number;
  pagesProcessed: number;
  sourceRequestCount: number;
  successfulSourceCalls: number;
  sourceNormalizedRows: number;
  stockSourceStagedRows: number;
  incomingSourceStagedRows: number;
  arrivalsSourceStagedRows: number;
  retryCount: number;
  recoveryAttemptCount: number;
  lastFailureRetryable: boolean;
  nextRecoveryAttemptAt: string | null;
  lastSuccessfulSourcePhase: string | null;
  technicalErrorCode: string | null;
  failedRequestKind: string | null;
  failedResourceName: string | null;
  failedHttpStatus: number | null;
  lastSchedulerSeenAt: string | null;
  expectedNextRunAt: string | null;
  physicalStockLastSourceSuccessAt: string | null;
  physicalStockLastPublicationAt: string | null;
  arrivalsLastSourceSuccessAt: string | null;
  arrivalsLastPublicationAt: string | null;
  physicalRows: number;
  reservedRows: number;
  incomingRows: number;
  warehousesLoaded: number;
  supplierBalanceRows?: number;
  supplierBalanceGroups?: number;
  supplierPositiveGroups?: number;
  supplierNonpositiveExcluded?: number;
  supplierOrdersRequested?: number;
  productsMatched: number;
  productsUnmatched: number;
  rowsPublished: number;
  rowsDeactivated: number;
  stockStagedRows?: number;
  arrivalsStagedRows?: number;
  stockDeltaUnchanged?: number;
  stockDeltaInserted?: number;
  stockDeltaUpdated?: number;
  stockDeltaRemoved?: number;
  arrivalsDeltaUnchanged?: number;
  arrivalsDeltaInserted?: number;
  arrivalsDeltaUpdated?: number;
  arrivalsDeltaRemoved?: number;
  publicationDbMs?: number | null;
  publicationApplicationMs?: number | null;
  publicationTimeoutBudgetMs?: number;
  publicationHeadroomPercent?: number | null;
  publicationLockWaitMs?: number | null;
  publicationTriggerRows?: number;
  scanComplete: boolean;
  startedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  errorCategory: string | null;
  failedStage: string | null;
  safeError: string | null;
  failedPage: number | null;
  updatedAt: string;
};

type CheckpointInput = {
  stage: StockSyncStage;
  nextSkip: number;
  received: number;
  normalized?: number;
  sourceStaged?: number;
  kind: StockBalanceKind | "warehouses" | "supplier_balance" | "supplier_documents";
  complete?: boolean;
  supplierStats?: { groups: number; positive: number; excluded: number };
};
type SourceOperation = {
  stage: StockSyncStage;
  requestKind: string;
  resourceName: string;
  purpose: string;
  outcome: "succeeded" | "retryable_failure" | "permanent_failure";
  httpStatus: number | null;
  rowsReceived: number;
  durationMs: number;
  retryIndex: number;
  errorCode: string | null;
  retryable: boolean;
};
export type StockSyncHeartbeat = { recoveryRequired: boolean; recoveryAllowed: boolean; schedulerState: "FRESH" | "STALE" };

export interface StockSyncStore {
  start(trigger?: StockSyncTrigger): Promise<{ state: StockSyncState; started: boolean }>;
  resumeFailed(): Promise<{ state: StockSyncState; resumed: boolean }>;
  heartbeat(): Promise<StockSyncHeartbeat>;
  getState(): Promise<StockSyncState>;
  claim(syncId: string, token: string): Promise<boolean>;
  release(syncId: string, token: string): Promise<void>;
  recordSourceOperation(syncId: string, operation: SourceOperation): Promise<void>;
  stageWarehouses(syncId: string, rows: StockWarehouseRow[]): Promise<number>;
  stageBalances(syncId: string, kind: StockBalanceKind, sourcePage: number, rows: StockStageRow[]): Promise<number>;
  stageSupplierBalances(syncId: string, sourcePage: number, rows: SupplierBalanceRow[]): Promise<void>;
  listSupplierOrderRefs(syncId: string, offset: number, limit: number): Promise<string[]>;
  stageSupplierDocuments(syncId: string, rows: SupplierOrderDocumentRow[]): Promise<void>;
  checkpoint(syncId: string, input: CheckpointInput): Promise<void>;
  publish(syncId: string): Promise<void>;
  fail(syncId: string, stage: StockSyncStage, page: number, error: unknown, retryable: boolean): Promise<void>;
  failLaunch(syncId: string, message: string): Promise<void>;
}

export class ChunkedStockSyncService {
  private readonly retry: { maxRetries: number; sleep: (ms: number) => Promise<void>; random: () => number };
  constructor(
    private readonly provider: StockBalanceProvider,
    private readonly supplierProvider: SupplierArrivalProvider,
    private readonly store: StockSyncStore,
    private readonly now: () => number = Date.now,
    retry: Partial<{ maxRetries: number; sleep: (ms: number) => Promise<void>; random: () => number }> = {},
    private readonly orchestrator?: CatalogSynchronizationOrchestrator,
  ) {
    this.retry = {
      maxRetries: retry.maxRetries ?? STOCK_SYNC_MAX_SOURCE_RETRIES,
      sleep: retry.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
      random: retry.random ?? Math.random,
    };
  }

  async start(trigger: StockSyncTrigger = "scheduled") {
    const result = await this.store.start(trigger);
    if (result.started && result.state.activeSyncId) {
      try {
        await this.orchestrator?.registerSourceRun(result.state.activeSyncId, "stock", trigger === "watchdog" ? "scheduled" : trigger);
      } catch (error) {
        await this.store.failLaunch(result.state.activeSyncId, "Synchronization audit registration failed.");
        throw error;
      }
    }
    return result;
  }
  getState() { return this.store.getState(); }
  heartbeat() { return this.store.heartbeat(); }
  resumeFailed() { return this.store.resumeFailed(); }
  resumePendingProjection() { return this.orchestrator?.resumePendingProjection() ?? Promise.resolve(null); }
  async failLaunch(syncId: string, message: string) {
    await this.store.failLaunch(syncId, message);
    await this.orchestrator?.failSourceSync(syncId, "stock", "CONTINUATION_LAUNCH_FAILED");
  }

  async continue(syncId: string) {
    let state = await this.store.getState();
    if (state.activeSyncId !== syncId || !["queued", "running"].includes(state.status)) return { state, pages: 0 };
    const token = crypto.randomUUID();
    if (!await this.store.claim(syncId, token)) return { state: await this.store.getState(), pages: 0 };
    const started = this.now();
    let pages = 0;
    try {
      while (pages < MAX_PAGES && this.now() - started < BUDGET_MS) {
        state = await this.store.getState();
        const stage = state.currentStage;
        if (!stage || stage === "completed" || stage === "stock_publication") break;
        if (stage === "supplier_order_documents") {
          const fetched = await this.fetchWithRetry(syncId, stage, () => this.supplierProvider.fetchSupplierOrderSnapshot(), (documents) => documents.length);
          await this.store.stageSupplierDocuments(syncId, fetched.value);
          pages += 1;
          await this.store.checkpoint(syncId, { stage: "stock_publication", nextSkip: 0, received: fetched.value.length, normalized: fetched.value.length, sourceStaged: fetched.value.length, kind: "supplier_documents", complete: true });
          await this.store.publish(syncId);
          const completedState = await this.store.getState();
          const projection = await this.completeOrchestration(syncId, completedState);
          return { state: completedState, pages, projection };
        }
        if (stage === "supplier_arrival_balance") {
          const fetched = await this.fetchWithRetry(syncId, stage, () => this.supplierProvider.fetchSupplierBalances(state.snapshotTime!), (page) => page.received);
          const page = fetched.value;
          await this.store.stageSupplierBalances(syncId, 0, page.items);
          pages += 1;
          await this.store.checkpoint(syncId, {
            stage: "supplier_order_documents",
            nextSkip: 0,
            received: page.received,
            normalized: page.items.length,
            sourceStaged: page.items.length,
            kind: "supplier_balance",
            supplierStats: { groups: page.groups, positive: page.items.filter((row) => row.remainingQuantity > 0).length, excluded: page.excluded },
          });
          continue;
        }
        const sourcePage = Math.floor(state.nextSkip / state.pageSize);
        let rowCount: number;
        if (stage === "warehouse_scan") {
          const fetched = await this.fetchWithRetry(syncId, stage, () => this.provider.fetchWarehouses(state.nextSkip, state.pageSize), (value) => value.rowCount);
          rowCount = fetched.value.rowCount;
          const staged = await this.store.stageWarehouses(syncId, fetched.value.items);
          await this.store.checkpoint(syncId, {
            stage: rowCount < state.pageSize ? nextStage(stage) : stage,
            nextSkip: rowCount < state.pageSize ? 0 : state.nextSkip + state.pageSize,
            received: rowCount,
            normalized: fetched.value.items.length,
            sourceStaged: staged,
            kind: "warehouses",
          });
        } else {
          const fetched = await this.fetchWithRetry(syncId, stage, () => this.provider.fetchBalances(kindFor(stage), state.snapshotTime!, state.nextSkip, state.pageSize), (value) => value.rowCount);
          rowCount = fetched.value.rowCount;
          const staged = await this.store.stageBalances(syncId, kindFor(stage), sourcePage, fetched.value.items);
          await this.store.checkpoint(syncId, {
            stage: rowCount < state.pageSize ? nextStage(stage) : stage,
            nextSkip: rowCount < state.pageSize ? 0 : state.nextSkip + state.pageSize,
            received: rowCount,
            normalized: fetched.value.items.length,
            sourceStaged: staged,
            kind: kindFor(stage),
          });
        }
        pages += 1;
      }
      await this.store.release(syncId, token);
      return { state: await this.store.getState(), pages };
    } catch (error) {
      const current = await this.store.getState();
      const stage = current.currentStage ?? "physical_scan";
      const retryable = isRetryableSourceError(error);
      console.error({ event: "stock_sync_chunk_failed", syncId, stage, errorType: error instanceof Error ? error.name : typeof error, errorCode: technicalErrorCode(error, stage), statusCode: getOneCSafeDiagnostic(error)?.statusCode ?? null, requestKind: operationIdentity(stage).requestKind, resourceName: operationIdentity(stage).resourceName, retryable });
      await this.store.fail(syncId, stage, current.pagesProcessed + 1, error, retryable);
      const failedState = await this.store.getState();
      if (!failedState.lastFailureRetryable) await this.orchestrator?.failSourceSync(syncId, "stock", failedState.technicalErrorCode ?? "STOCK_SYNC_FAILURE");
      return { state: failedState, pages, projection: null };
    }
  }

  private async fetchWithRetry<T>(syncId: string, stage: StockSyncStage, fetcher: () => Promise<T>, rows: (value: T) => number): Promise<{ value: T; retryCount: number }> {
    let totalDelayMs = 0;
    for (let attempt = 0; ; attempt += 1) {
      const startedAt = performance.now();
      let value: T;
      try {
        value = await fetcher();
      } catch (error) {
        const retryable = isRetryableSourceError(error);
        const diagnostic = getOneCSafeDiagnostic(error);
        await this.store.recordSourceOperation(syncId, { ...operationIdentity(stage), stage, outcome: retryable ? "retryable_failure" : "permanent_failure", httpStatus: diagnostic?.statusCode ?? null, rowsReceived: 0, durationMs: Math.max(0, Math.round(performance.now() - startedAt)), retryIndex: attempt, errorCode: technicalErrorCode(error, stage), retryable });
        if (!retryable || attempt >= this.retry.maxRetries) throw error;
        const delayMs = retryDelayMs(attempt, diagnostic?.retryAfterMs ?? null, this.retry.random());
        if (totalDelayMs + delayMs > STOCK_SYNC_RETRY_DELAY_BUDGET_MS) throw error;
        totalDelayMs += delayMs;
        console.warn({ event: "stock_sync_source_retry", syncId, stage, retryAttempt: attempt + 1, delayMs, httpStatus: diagnostic?.statusCode ?? null, errorCode: technicalErrorCode(error, stage) });
        await this.retry.sleep(delayMs);
        continue;
      }
      await this.store.recordSourceOperation(syncId, { ...operationIdentity(stage), stage, outcome: "succeeded", httpStatus: 200, rowsReceived: rows(value), durationMs: Math.max(0, Math.round(performance.now() - startedAt)), retryIndex: attempt, errorCode: null, retryable: false });
      return { value, retryCount: attempt };
    }
  }

  private completeOrchestration(syncId: string, state: StockSyncState): Promise<CatalogProjectionOutcome | null> {
    if (!this.orchestrator) return Promise.resolve(null);
    return this.orchestrator.completeSourceSync({ sourceSyncId: syncId, sourceDomain: "stock", changedCounts: { stockRows: state.rowsPublished, deactivated: state.rowsDeactivated, productsMatched: state.productsMatched, productsUnmatched: state.productsUnmatched }, sourceDurationMs: durationBetween(state.startedAt, state.updatedAt) });
  }
}

export class SupabaseStockSyncStore implements StockSyncStore {
  async start(trigger: StockSyncTrigger = "scheduled") {
    const { data, error } = await createAdminClient().rpc("start_exact_stock_sync", { p_trigger: trigger });
    if (error || !isStartResult(data)) throw dbError(error);
    return { state: await this.getState(), started: data.result === "acquired" || data.result === "stale_lock_recovered" };
  }
  async resumeFailed() {
    const { data, error } = await createAdminClient().rpc("resume_failed_stock_sync");
    if (error || !isStartResult(data)) throw dbError(error);
    return { state: await this.getState(), resumed: data.result === "resumed" };
  }
  async heartbeat(): Promise<StockSyncHeartbeat> {
    const { data, error } = await createAdminClient().rpc("heartbeat_stock_sync_scheduler");
    if (error || !isRecord(data)) throw dbError(error);
    return { recoveryRequired: data.recoveryRequired === true, recoveryAllowed: data.recoveryAllowed === true, schedulerState: data.schedulerState === "STALE" ? "STALE" : "FRESH" };
  }
  async getState() {
    const { data, error } = await createAdminClient().from("stock_sync_state").select("*").eq("id", "exact_stock").single();
    if (error || !data) throw dbError(error);
    return mapState(data);
  }
  async claim(id: string, token: string) {
    const { data, error } = await createAdminClient().rpc("claim_stock_sync_chunk", { p_sync_id: id, p_token: token });
    if (error) throw dbError(error);
    return data === true;
  }
  async release(id: string, token: string) {
    const { error } = await createAdminClient().from("stock_sync_state").update({ active_chunk_token: null, chunk_started_at: null, updated_at: new Date().toISOString() }).eq("id", "exact_stock").eq("active_sync_id", id).eq("active_chunk_token", token);
    if (error) throw dbError(error);
  }
  async recordSourceOperation(id: string, operation: SourceOperation) {
    const { error } = await createAdminClient().rpc("record_stock_sync_source_operation", { p_sync_id: id, p_stage: operation.stage, p_request_kind: operation.requestKind, p_resource_name: operation.resourceName, p_purpose: operation.purpose, p_outcome: operation.outcome, p_http_status: operation.httpStatus, p_rows_received: operation.rowsReceived, p_duration_ms: operation.durationMs, p_retry_index: operation.retryIndex, p_error_code: operation.errorCode, p_retryable: operation.retryable });
    if (error) throw dbError(error);
  }
  async stageWarehouses(id: string, rows: StockWarehouseRow[]) {
    if (!rows.length) return 0;
    const { error } = await createAdminClient().from("stock_warehouse_sync_stage").upsert(rows.map((row) => ({ sync_id: id, external_ref: row.externalRef, code: row.code, name: row.name, organization_ref: row.organizationRef, is_active: row.isActive })), { onConflict: "sync_id,external_ref" });
    if (error) throw dbError(error);
    return rows.length;
  }
  async stageBalances(id: string, kind: StockBalanceKind, sourcePage: number, rows: StockStageRow[]) {
    const client = createAdminClient();
    const payload = rows.map((row) => ({ external_product_ref: row.externalProductRef, external_warehouse_ref: row.externalWarehouseRef, external_characteristic_ref: row.externalCharacteristicRef, quantity: row.quantity }));
    let { data, error } = await client.rpc("stage_stock_balance_rows", { p_sync_id: id, p_kind: kind, p_source_page: sourcePage, p_rows: payload });
    if (error?.code === "PGRST202") ({ data, error } = await client.rpc("stage_stock_balance_rows", { p_sync_id: id, p_kind: kind, p_rows: payload }));
    if (error) throw dbError(error);
    return Number(data ?? 0);
  }
  async stageSupplierBalances(id: string, sourcePage: number, rows: SupplierBalanceRow[]) {
    const { error } = await createAdminClient().rpc("stage_supplier_arrival_balance_rows", { p_sync_id: id, p_source_page: sourcePage, p_rows: rows.map((row) => ({ external_supplier_order_ref: row.externalSupplierOrderRef, external_product_ref: row.externalProductRef, external_characteristic_ref: row.externalCharacteristicRef, remaining_quantity: row.remainingQuantity })) });
    if (error) throw dbError(error);
  }
  async listSupplierOrderRefs(id: string, offset: number, limit: number) {
    const { data, error } = await createAdminClient().rpc("list_supplier_order_refs", { p_sync_id: id, p_offset: offset, p_limit: limit });
    if (error) throw dbError(error);
    return (data ?? []).map((row: { external_supplier_order_ref: string }) => row.external_supplier_order_ref);
  }
  async stageSupplierDocuments(id: string, rows: SupplierOrderDocumentRow[]) {
    if (!rows.length) return;
    const client = createAdminClient();
    const { error } = await client.from("supplier_order_document_stage").upsert(rows.map((row) => ({ sync_id: id, external_supplier_order_ref: row.externalSupplierOrderRef, source_order_number: row.sourceOrderNumber, source_document_date: row.sourceDocumentDate, is_posted: row.isPosted, is_deleted: row.isDeleted, is_closed: row.isClosed, external_state_ref: row.externalStateRef, expected_arrival_date: row.expectedArrivalDate, date_placement: row.datePlacement, organization_ref: row.organizationRef, warehouse_ref: row.warehouseRef, source_version: row.sourceVersion })), { onConflict: "sync_id,external_supplier_order_ref" });
    if (error) throw dbError(error);
    const lines = rows.flatMap((row) => row.lines.map((line) => ({ sync_id: id, external_supplier_order_ref: row.externalSupplierOrderRef, line_number: line.lineNumber, external_product_ref: line.externalProductRef, external_characteristic_ref: line.externalCharacteristicRef, ordered_quantity: line.orderedQuantity, unit: line.unit, expected_arrival_date: line.expectedArrivalDate })));
    if (!lines.length) return;
    const { error: lineError } = await client.from("supplier_order_item_stage").upsert(lines, { onConflict: "sync_id,external_supplier_order_ref,line_number" });
    if (lineError) throw dbError(lineError);
  }
  async checkpoint(id: string, input: CheckpointInput) {
    const state = await this.getState();
    const payload: Record<string, unknown> = { status: "running", current_stage: input.stage, next_skip: input.nextSkip, pages_processed: state.pagesProcessed + 1, scan_complete: input.complete ?? state.scanComplete, last_successful_source_phase: input.kind, updated_at: new Date().toISOString() };
    const key = input.kind === "warehouses" ? "warehouses_loaded" : input.kind === "supplier_balance" ? "supplier_balance_rows" : input.kind === "supplier_documents" ? "supplier_orders_requested" : `${input.kind}_rows`;
    payload[key] = numericState(state, key) + input.received;
    payload.source_normalized_rows = state.sourceNormalizedRows + (input.normalized ?? input.received);
    if (["physical", "reserved", "incoming"].includes(input.kind)) {
      payload.stock_source_staged_rows = state.stockSourceStagedRows + (input.sourceStaged ?? 0);
    }
    if (input.kind === "incoming") {
      payload.incoming_source_staged_rows = state.incomingSourceStagedRows + (input.sourceStaged ?? 0);
    }
    if (input.kind === "supplier_balance" || input.kind === "supplier_documents") {
      payload.arrivals_source_staged_rows = state.arrivalsSourceStagedRows + (input.sourceStaged ?? 0);
    }
    if (input.supplierStats) {
      payload.supplier_balance_groups = (state.supplierBalanceGroups ?? 0) + input.supplierStats.groups;
      payload.supplier_positive_groups = (state.supplierPositiveGroups ?? 0) + input.supplierStats.positive;
      payload.supplier_nonpositive_excluded = (state.supplierNonpositiveExcluded ?? 0) + input.supplierStats.excluded;
    }
    if (input.kind === "incoming" && input.stage === "supplier_arrival_balance") {
      payload.physical_stock_last_source_success_at = new Date().toISOString();
    }
    if (input.kind === "supplier_documents") {
      payload.arrivals_last_source_success_at = new Date().toISOString();
    }
    const { error } = await createAdminClient().from("stock_sync_state").update(payload).eq("id", "exact_stock").eq("active_sync_id", id);
    if (error) throw dbError(error);
  }
  async publish(id: string) {
    const client = createAdminClient();
    const { error: prepareError } = await client.rpc("prepare_exact_stock_publication", { p_sync_id: id });
    if (prepareError) throw dbError(prepareError);
    const started = performance.now();
    const { error } = await client.rpc("publish_exact_stock_snapshot", { p_sync_id: id });
    const applicationMs = Math.max(0, Math.round(performance.now() - started));
    if (error) throw dbError(error, { applicationMs });
    const { error: metricError } = await client.from("stock_sync_state").update({ publication_application_ms: applicationMs }).eq("id", "exact_stock").eq("last_completed_sync_id", id);
    if (metricError) console.warn({ event: "stock_publication_metric_write_failed", syncId: id, errorCode: metricError.code });
    await projectPartnerProductTransitions(id);
  }
  async fail(id: string, stage: StockSyncStage, page: number, error: unknown, retryable: boolean) {
    const diagnostic = getOneCSafeDiagnostic(error);
    const { error: persistenceError } = await createAdminClient().rpc("fail_stock_sync_run", { p_sync_id: id, p_stage: stage, p_page: page, p_category: errorCategory(stage), p_code: technicalErrorCode(error, stage), p_safe_error: safeIntegrationError(error), p_retryable: retryable, p_request_kind: operationIdentity(stage).requestKind, p_resource_name: diagnostic?.resourceName ?? operationIdentity(stage).resourceName, p_http_status: diagnostic?.statusCode ?? null, p_application_ms: readDiagnosticNumber(error, "applicationMs") });
    if (persistenceError) throw dbError(persistenceError);
  }
  async failLaunch(id: string, message: string) {
    const { error } = await createAdminClient().rpc("fail_stock_sync_run", { p_sync_id: id, p_stage: "continuation_launch", p_page: 0, p_category: "orchestration_failure", p_code: "STOCK_CONTINUATION_LAUNCH_FAILED", p_safe_error: message, p_retryable: true, p_request_kind: "continuation_launch", p_resource_name: "internal_stock_sync", p_http_status: null, p_application_ms: null });
    if (error) throw dbError(error);
  }
}

function nextStage(stage: StockSyncStage): StockSyncStage { if (stage === "warehouse_scan") return "physical_scan"; if (stage === "physical_scan") return "reserved_scan"; if (stage === "reserved_scan") return "incoming_scan"; if (stage === "incoming_scan") return "supplier_arrival_balance"; return stage; }
function kindFor(stage: StockSyncStage): StockBalanceKind { if (stage === "physical_scan") return "physical"; if (stage === "reserved_scan") return "reserved"; return "incoming"; }
function operationIdentity(stage: StockSyncStage) {
  if (stage === "warehouse_scan") return { requestKind: "stock_warehouse_scan", resourceName: ONE_C_STOCK_BALANCE_RESOURCES.warehouses, purpose: "warehouse_scope" };
  if (stage === "physical_scan") return { requestKind: "stock_balance_scan", resourceName: ONE_C_STOCK_BALANCE_RESOURCES.physical, purpose: "physical_stock" };
  if (stage === "reserved_scan") return { requestKind: "stock_balance_scan", resourceName: ONE_C_STOCK_BALANCE_RESOURCES.reserved, purpose: "reserved_stock" };
  if (stage === "incoming_scan") return { requestKind: "stock_balance_scan", resourceName: ONE_C_STOCK_BALANCE_RESOURCES.incoming, purpose: "incoming_stock" };
  if (stage === "supplier_arrival_balance") return { requestKind: "supplier_arrival_balance", resourceName: ONE_C_SUPPLIER_ARRIVAL_RESOURCES.balance, purpose: "supplier_arrivals" };
  if (stage === "supplier_order_documents") return { requestKind: "supplier_order_document_scan", resourceName: ONE_C_SUPPLIER_ARRIVAL_RESOURCES.document, purpose: "supplier_arrival_documents" };
  return { requestKind: stage, resourceName: "stock_publication", purpose: "stock_publication" };
}
export function isRetryableStockSourceError(error: unknown): boolean { return isRetryableSourceError(error); }
function isRetryableSourceError(error: unknown): boolean {
  if (error instanceof IntegrationTimeoutError) return true;
  if (error instanceof IntegrationProviderUnavailableError) return isRecord(error) && typeof error.networkCode === "string" && ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EPIPE", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT"].includes(error.networkCode);
  const status = getOneCSafeDiagnostic(error)?.statusCode;
  return status !== null && status !== undefined && [429, 500, 502, 503, 504].includes(status);
}
function retryDelayMs(retryIndex: number, retryAfterMs: number | null, random: number) { const base = [500, 1_500, 3_000][retryIndex] ?? 3_000; return Math.min(30_000, Math.max(retryAfterMs ?? 0, base + Math.round(base * 0.2 * Math.max(0, Math.min(1, random))))); }
function technicalErrorCode(error: unknown, stage: StockSyncStage): string {
  const diagnostic = getOneCSafeDiagnostic(error);
  if (diagnostic?.statusCode) return `${stage.toUpperCase()}_HTTP_${diagnostic.statusCode}`;
  if (error instanceof IntegrationTimeoutError) return `${stage.toUpperCase()}_TIMEOUT`;
  if (error instanceof IntegrationProviderUnavailableError) return `${stage.toUpperCase()}_NETWORK_FAILURE`;
  const code = isRecord(error) && typeof error.code === "string" ? error.code : null;
  return code ? code.slice(0, 80) : `${stage.toUpperCase()}_INVALID_RESPONSE`;
}
function safeIntegrationError(error: unknown): string {
  const diagnostic = getOneCSafeDiagnostic(error);
  if (diagnostic) return [`status=${diagnostic.statusCode ?? "network"}`, diagnostic.safeErrorSummary].filter(Boolean).join(" ").slice(0, 300);
  if (error instanceof IntegrationTimeoutError) return "1C OData request timed out.";
  if (error instanceof IntegrationProviderUnavailableError) return "1C OData connection failed.";
  return "Stock source synchronization failed validation.";
}
function errorCategory(stage: StockSyncStage) { return stage === "stock_publication" ? "publication_failure" : "odata_failure"; }
function dbError(error: unknown, diagnostic?: Record<string, unknown>) { const code = isRecord(error) && typeof error.code === "string" ? error.code : undefined; return Object.assign(new Error("Stock persistence failed."), { code, diagnostic }); }
function mapState(row: Record<string, unknown>): StockSyncState {
  return {
    status: row.status as StockSyncStatus, activeSyncId: stringOrNull(row.active_sync_id), lastFailedSyncId: stringOrNull(row.last_failed_sync_id), snapshotTime: stringOrNull(row.snapshot_time), currentStage: row.current_stage as StockSyncStage | null, nextSkip: numberValue(row.next_skip), pageSize: numberValue(row.page_size), pagesProcessed: numberValue(row.pages_processed), sourceRequestCount: numberValue(row.source_request_count), successfulSourceCalls: numberValue(row.successful_source_calls), sourceNormalizedRows: numberValue(row.source_normalized_rows), stockSourceStagedRows: numberValue(row.stock_source_staged_rows), incomingSourceStagedRows: numberValue(row.incoming_source_staged_rows), arrivalsSourceStagedRows: numberValue(row.arrivals_source_staged_rows), retryCount: numberValue(row.retry_count), recoveryAttemptCount: numberValue(row.recovery_attempt_count), lastFailureRetryable: row.last_failure_retryable === true, nextRecoveryAttemptAt: stringOrNull(row.next_recovery_attempt_at), lastSuccessfulSourcePhase: stringOrNull(row.last_successful_source_phase), technicalErrorCode: stringOrNull(row.technical_error_code), failedRequestKind: stringOrNull(row.failed_request_kind), failedResourceName: stringOrNull(row.failed_resource_name), failedHttpStatus: nullableNumber(row.failed_http_status), lastSchedulerSeenAt: stringOrNull(row.last_scheduler_seen_at), expectedNextRunAt: stringOrNull(row.expected_next_run_at), physicalStockLastSourceSuccessAt: stringOrNull(row.physical_stock_last_source_success_at), physicalStockLastPublicationAt: stringOrNull(row.physical_stock_last_publication_at), arrivalsLastSourceSuccessAt: stringOrNull(row.arrivals_last_source_success_at), arrivalsLastPublicationAt: stringOrNull(row.arrivals_last_publication_at),
    physicalRows: numberValue(row.physical_rows), reservedRows: numberValue(row.reserved_rows), incomingRows: numberValue(row.incoming_rows), warehousesLoaded: numberValue(row.warehouses_loaded), supplierBalanceRows: numberValue(row.supplier_balance_rows), supplierBalanceGroups: numberValue(row.supplier_balance_groups), supplierPositiveGroups: numberValue(row.supplier_positive_groups), supplierNonpositiveExcluded: numberValue(row.supplier_nonpositive_excluded), supplierOrdersRequested: numberValue(row.supplier_orders_requested), productsMatched: numberValue(row.products_matched), productsUnmatched: numberValue(row.products_unmatched), rowsPublished: numberValue(row.rows_published), rowsDeactivated: numberValue(row.rows_deactivated), stockStagedRows: numberValue(row.stock_staged_rows), arrivalsStagedRows: numberValue(row.arrivals_staged_rows), stockDeltaUnchanged: numberValue(row.stock_delta_unchanged), stockDeltaInserted: numberValue(row.stock_delta_inserted), stockDeltaUpdated: numberValue(row.stock_delta_updated), stockDeltaRemoved: numberValue(row.stock_delta_removed), arrivalsDeltaUnchanged: numberValue(row.arrivals_delta_unchanged), arrivalsDeltaInserted: numberValue(row.arrivals_delta_inserted), arrivalsDeltaUpdated: numberValue(row.arrivals_delta_updated), arrivalsDeltaRemoved: numberValue(row.arrivals_delta_removed), publicationDbMs: nullableNumber(row.publication_db_ms), publicationApplicationMs: nullableNumber(row.publication_application_ms), publicationTimeoutBudgetMs: numberValue(row.publication_timeout_budget_ms), publicationHeadroomPercent: nullableNumber(row.publication_headroom_percent), publicationLockWaitMs: nullableNumber(row.publication_lock_wait_ms), publicationTriggerRows: numberValue(row.publication_trigger_rows), scanComplete: row.scan_complete === true, startedAt: stringOrNull(row.started_at), lastSuccessfulSyncAt: stringOrNull(row.last_successful_sync_at), errorCategory: stringOrNull(row.error_category), failedStage: stringOrNull(row.failed_stage), safeError: stringOrNull(row.safe_error), failedPage: nullableNumber(row.failed_page), updatedAt: String(row.updated_at),
  };
}
function numericState(state: StockSyncState, key: string) { if (key === "warehouses_loaded") return state.warehousesLoaded; if (key === "physical_rows") return state.physicalRows; if (key === "reserved_rows") return state.reservedRows; if (key === "incoming_rows") return state.incomingRows; if (key === "supplier_balance_rows") return state.supplierBalanceRows ?? 0; if (key === "supplier_orders_requested") return state.supplierOrdersRequested ?? 0; return 0; }
function readDiagnosticNumber(error: unknown, key: string) { if (!isRecord(error) || !isRecord(error.diagnostic)) return null; const value = error.diagnostic[key]; return typeof value === "number" ? value : null; }
function durationBetween(startedAt: string | null, finishedAt: string | null) { const start = startedAt ? Date.parse(startedAt) : Number.NaN; const finish = finishedAt ? Date.parse(finishedAt) : Date.now(); return Number.isFinite(start) && Number.isFinite(finish) ? Math.max(0, finish - start) : 0; }
function isStartResult(value: unknown): value is { result: string; sync_id: string | null } { return isRecord(value) && typeof value.result === "string" && (typeof value.sync_id === "string" || value.sync_id === null); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function stringOrNull(value: unknown) { return typeof value === "string" ? value : null; }
function numberValue(value: unknown) { return typeof value === "number" ? value : 0; }
function nullableNumber(value: unknown) { return typeof value === "number" ? value : null; }

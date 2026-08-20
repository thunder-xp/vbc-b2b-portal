import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { IntegrationProviderUnavailableError, IntegrationTimeoutError } from "../../errors";
import type { PriceChunkProvider, PriceRegisterStageRow } from "../../providers/one-c";
import { ChunkedPriceSyncService, isPriceSyncLockStale, PRICE_SYNC_PAGES_PER_INVOCATION, type PriceSyncStage, type PriceSyncState, type PriceSyncStateStore } from "../chunked-price-sync";

describe("ChunkedPriceSyncService", () => {
  it("processes only the bounded number of pages and persists continuation offset", async () => {
    const store = storeFixture();
    const provider = providerFixture({ priceRows: 500 });
    const result = await new ChunkedPriceSyncService(provider, store).continue(syncId);
    expect(result.pagesProcessedThisInvocation).toBe(PRICE_SYNC_PAGES_PER_INVOCATION);
    expect(result.needsContinuation).toBe(true);
    expect(store.state.nextSkip).toBe(1500);
  });

  it("resumes from persisted next_skip", async () => {
    const store = storeFixture({ currentStage: "price_register_scan", nextSkip: 2500, pagesProcessed: 5 });
    const provider = providerFixture({ priceRows: 0 });
    await new ChunkedPriceSyncService(provider, store).continue(syncId);
    expect(provider.fetchPrices).toHaveBeenCalledWith(2500, 500);
    expect(store.publish).toHaveBeenCalledOnce();
  });

  it("treats a repeated continuation for a completed sync as an idempotent no-op", async () => {
    const store = storeFixture({ status: "succeeded", activeSyncId: null, currentStage: "completed" });
    const provider = providerFixture();
    const result = await new ChunkedPriceSyncService(provider, store).continue(syncId);
    expect(result.needsContinuation).toBe(false);
    expect(provider.fetchPrices).not.toHaveBeenCalled();
  });

  it("does not process a duplicate continuation that cannot claim the chunk", async () => {
    const store = storeFixture();
    store.claimChunk.mockResolvedValueOnce(false);
    const provider = providerFixture();
    const result = await new ChunkedPriceSyncService(provider, store).continue(syncId);
    expect(result.pagesProcessedThisInvocation).toBe(0);
    expect(provider.fetchPriceTypes).not.toHaveBeenCalled();
  });

  it("stops within the duration budget without depending on a 300 second request", async () => {
    const store = storeFixture();
    const provider = providerFixture({ priceRows: 500 });
    let time = 0;
    const result = await new ChunkedPriceSyncService(provider, store, () => (time += 30_000)).continue(syncId);
    expect(result.pagesProcessedThisInvocation).toBe(1);
    expect(result.needsContinuation).toBe(true);
  });

  it("keeps the job failed and does not publish after a middle-page failure", async () => {
    const store = storeFixture({ currentStage: "price_register_scan" });
    const provider = providerFixture();
    provider.fetchPrices.mockRejectedValueOnce(new Error("transport"));
    await new ChunkedPriceSyncService(provider, store).continue(syncId);
    expect(store.publish).not.toHaveBeenCalled();
    expect(store.state.status).toBe("failed");
  });

  it.each([1, 2])("retries one failed page %s time(s) and then continues", async (failures) => {
    const store = storeFixture({ currentStage: "price_register_scan" });
    const provider = providerFixture();
    for (let index = 0; index < failures; index += 1) provider.fetchPrices.mockRejectedValueOnce(httpError(500));
    provider.fetchPrices.mockResolvedValueOnce({ items: [], rowCount: 0, integrity: integrity("recovered") });
    const sleep = vi.fn(async () => undefined);
    await new ChunkedPriceSyncService(provider, store, Date.now, { sleep, random: () => 0 }).continue(syncId);
    expect(provider.fetchPrices).toHaveBeenCalledTimes(failures + 1);
    expect(sleep).toHaveBeenCalledTimes(failures);
    expect(store.publish).toHaveBeenCalledOnce();
    expect(store.state.retryCount).toBe(failures);
  });

  it("exhausts the bounded retry cap without publishing", async () => {
    const store = storeFixture({ currentStage: "price_register_scan" });
    const provider = providerFixture();
    provider.fetchPrices.mockRejectedValue(httpError(500));
    await new ChunkedPriceSyncService(provider, store, Date.now, { sleep: async () => undefined, random: () => 0 }).continue(syncId);
    expect(provider.fetchPrices).toHaveBeenCalledTimes(4);
    expect(store.publish).not.toHaveBeenCalled();
    expect(store.state.status).toBe("failed");
  });

  it("honors Retry-After for 429 and does not retry permanent 400", async () => {
    const retryStore = storeFixture({ currentStage: "price_register_scan" });
    const retryProvider = providerFixture();
    retryProvider.fetchPrices.mockRejectedValueOnce(httpError(429, 2_000));
    retryProvider.fetchPrices.mockResolvedValueOnce({ items: [], rowCount: 0, integrity: integrity("rate-recovered") });
    const sleep = vi.fn(async () => undefined);
    await new ChunkedPriceSyncService(retryProvider, retryStore, Date.now, { sleep, random: () => 0 }).continue(syncId);
    expect(sleep).toHaveBeenCalledWith(2_000);

    const permanentStore = storeFixture({ currentStage: "price_register_scan" });
    const permanentProvider = providerFixture();
    permanentProvider.fetchPrices.mockRejectedValue(httpError(400));
    await new ChunkedPriceSyncService(permanentProvider, permanentStore, Date.now, { sleep: async () => undefined }).continue(syncId);
    expect(permanentProvider.fetchPrices).toHaveBeenCalledOnce();
  });

  it("retries a bounded timeout and repeats only the same offset", async () => {
    const store = storeFixture({ currentStage: "price_register_scan", nextSkip: 36_000, pagesProcessed: 74 });
    const provider = providerFixture();
    provider.fetchPrices.mockRejectedValueOnce(new IntegrationTimeoutError());
    provider.fetchPrices.mockResolvedValueOnce({ items: [], rowCount: 0, integrity: integrity("timeout-recovered") });
    await new ChunkedPriceSyncService(provider, store, Date.now, { sleep: async () => undefined }).continue(syncId);
    expect(provider.fetchPrices.mock.calls).toEqual([[36_000, 500], [36_000, 500]]);
  });

  it("retries a proven connection reset but not an unconfigured provider", async () => {
    const retryStore = storeFixture({ currentStage: "price_register_scan" });
    const retryProvider = providerFixture();
    retryProvider.fetchPrices.mockRejectedValueOnce(Object.assign(new IntegrationProviderUnavailableError(), { networkCode: "ECONNRESET" }));
    retryProvider.fetchPrices.mockResolvedValueOnce({ items: [], rowCount: 0, integrity: integrity("reset-recovered") });
    await new ChunkedPriceSyncService(retryProvider, retryStore, Date.now, { sleep: async () => undefined }).continue(syncId);
    expect(retryProvider.fetchPrices).toHaveBeenCalledTimes(2);

    const permanentStore = storeFixture({ currentStage: "price_register_scan" });
    const permanentProvider = providerFixture();
    permanentProvider.fetchPrices.mockRejectedValue(new IntegrationProviderUnavailableError("1C OData is not configured."));
    await new ChunkedPriceSyncService(permanentProvider, permanentStore, Date.now, { sleep: async () => undefined }).continue(syncId);
    expect(permanentProvider.fetchPrices).toHaveBeenCalledOnce();
  });

  it("rejects a repeated page identity before publication", async () => {
    const store = storeFixture({ currentStage: "price_register_scan", nextSkip: 500, pagesProcessed: 1, lastPageStage: "price_register_scan", lastPageNumber: 1, lastPageFingerprint: "same", lastPageFirstKey: "a", lastPageLastKey: "z" });
    const provider = providerFixture({ priceRows: 1 });
    provider.fetchPrices.mockResolvedValueOnce({ items: [priceRow()], rowCount: 1, integrity: { fingerprint: "same", firstStableKey: "a", lastStableKey: "z" } });
    await new ChunkedPriceSyncService(provider, store).continue(syncId);
    expect(store.state.errorCategory).toBe("page_integrity_failure");
    expect(store.publish).not.toHaveBeenCalled();
  });

  it("completes a production-sized 35,000-row healthy scan without retries", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const store = storeFixture({ currentStage: "price_register_scan" });
    const provider = providerFixture({ priceRows: 500, totalPriceRows: 35_000 });
    let result = await new ChunkedPriceSyncService(provider, store).continue(syncId);
    while (result.needsContinuation) result = await new ChunkedPriceSyncService(provider, store).continue(syncId);
    expect(store.state).toMatchObject({ status: "succeeded", rowsScanned: 35_000, retryCount: 0, odataRequestCount: 71 });
    expect(provider.fetchPrices).toHaveBeenCalledTimes(71);
    info.mockRestore();
  }, 20_000);

  it("deduplicates a price page before calling the staging RPC", async () => {
    const store = storeFixture({ currentStage: "price_register_scan" });
    const provider = providerFixture({ priceRows: 2 });
    provider.fetchPrices.mockResolvedValueOnce({ rowCount: 2, items: [priceRow({ amount: 100 }), priceRow({ amount: 120, effectiveAt: "2026-02-01T00:00:00Z" })], integrity: integrity("price-page") });
    await new ChunkedPriceSyncService(provider, store).continue(syncId);
    expect(store.stagePrices).toHaveBeenCalledWith(syncId, [expect.objectContaining({ amount: 120 })]);
    expect(store.stageRetailHistory).toHaveBeenCalledWith(syncId, expect.arrayContaining([
      expect.objectContaining({ amount: 100 }),
      expect.objectContaining({ amount: 120 }),
    ]), 0);
    expect(store.state).toMatchObject({ priceRowsReceived: 2, priceUniqueKeys: 1, priceDuplicateKeys: 1, priceRowsDeduplicated: 1 });
  });

  it("preserves sanitized database diagnostics for a future staging failure", async () => {
    const store = storeFixture({ currentStage: "price_register_scan" });
    const provider = providerFixture({ priceRows: 1 });
    provider.fetchPrices.mockResolvedValueOnce({ rowCount: 1, items: [priceRow()], integrity: integrity("staging-failure") });
    store.stagePrices.mockRejectedValueOnce(Object.assign(new Error("safe"), { code: "21000", databaseMessage: "ON CONFLICT command failed", databaseDetails: "constraint conflict", databaseHint: "Deduplicate rows", errorCategory: "staging_failure" }));
    await new ChunkedPriceSyncService(provider, store).continue(syncId);
    expect(store.fail).toHaveBeenCalledWith(syncId, "staging_failure", "price_register_scan", 1, "21000", "ON CONFLICT command failed constraint conflict Deduplicate rows");
  });

  it("recovers only genuinely stale running locks", () => {
    expect(isPriceSyncLockStale({ status: "running", updatedAt: "2026-07-12T11:00:00.000Z" }, Date.parse(now))).toBe(true);
    expect(isPriceSyncLockStale({ status: "running", updatedAt: now }, Date.parse(now))).toBe(false);
    expect(isPriceSyncLockStale({ status: "failed", updatedAt: "2026-07-12T11:00:00.000Z" }, Date.parse(now))).toBe(false);
  });
});

describe("transactional price snapshot SQL", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260712180000_chunked_price_sync_foundation.sql"), "utf8");
  it("keeps the latest Period across chunks including later inactive rows", () => { expect(sql).toContain("excluded.effective_at >= current.effective_at"); expect(sql).toContain("is_current = excluded.is_current"); });
  it("publishes only zero-characteristic base prices", () => { expect(sql).toMatch(/s\.external_characteristic_ref\s*=\s*'00000000-0000-0000-0000-000000000000'/); });
  it("publishes price types and prices in one transaction and cleans stages last", () => { const types = sql.indexOf("insert into public.price_types"); const prices = sql.indexOf("insert into public.product_prices"); const cleanup = sql.indexOf("delete from public.product_price_sync_stage"); expect(types).toBeGreaterThan(-1); expect(prices).toBeGreaterThan(types); expect(cleanup).toBeGreaterThan(prices); });
  it("does not expose staging tables to browser roles", () => { expect(sql).toMatch(/revoke all[\s\S]*public\.price_sync_state[\s\S]*public\.product_price_sync_stage[\s\S]*from anon, authenticated/); });
});

describe("price staging duplicate SQL defense", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260712190000_price_stage_duplicate_defense.sql"), "utf8");
  it("ranks duplicate logical keys before insert", () => { expect(sql).toContain("row_number() over"); expect(sql).toContain("partition by external_product_ref, external_price_type_ref, external_characteristic_ref"); expect(sql).toContain("where row_rank = 1"); });
  it("uses deterministic latest and stable-order precedence", () => { expect(sql).toContain("order by effective_at desc, ordinality desc, is_current asc"); });
});

describe("price page integrity migration", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260820094727_price_sync_page_integrity.sql"), "utf8");
  it("persists page identity and bounded performance counters without exposing data", () => {
    expect(sql).toContain("last_page_fingerprint text");
    expect(sql).toContain("retry_count integer not null default 0");
    expect(sql).toContain("odata_request_duration_ms bigint not null default 0");
    expect(sql).not.toMatch(/grant\s+.*(?:anon|authenticated)/i);
  });
});

describe("retail history backfill failure lifecycle", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/modules/integration/sync/chunked-price-sync.ts"),
    "utf8",
  );

  it("releases the reviewed backfill lock when source or launch fails", () => {
    expect(source).toContain('from("retail_price_history_backfill_runs").update');
    expect(source).toContain('"RETAIL_HISTORY_SOURCE_QUERY_FAILED"');
    expect(source).toContain('.in("status", ["requested", "running"])');
  });
});

function providerFixture(options: { priceRows?: number; totalPriceRows?: number } = {}) {
  const priceRows = options.priceRows ?? 0;
  return {
    fetchPriceTypes: vi.fn(async () => ({ items: [], rowCount: 0, integrity: integrity("price-types") })),
    fetchCurrencies: vi.fn(async () => ({ items: [], rowCount: 0, integrity: integrity("currencies") })),
    fetchPrices: vi.fn(async (skip: number) => { const count = options.totalPriceRows === undefined ? priceRows : Math.max(0, Math.min(priceRows, options.totalPriceRows - skip)); return { items: Array.from({ length: count }, (_, index) => priceRow({ externalProductRef: `product-${skip + index}` })), rowCount: count, integrity: integrity(`prices-${skip}`) }; }),
  } satisfies PriceChunkProvider;
}

function storeFixture(overrides: Partial<PriceSyncState> = {}) {
  const state: PriceSyncState = { status: "running", activeSyncId: syncId, lastFailedSyncId: null, startedAt: now, finishedAt: null, lastSuccessfulSyncAt: null, currentStage: "price_type_scan", nextSkip: 0, pageSize: 500, pagesProcessed: 0, rowsScanned: 0, rowsStaged: 0, priceRowsReceived: 0, priceUniqueKeys: 0, priceDuplicateKeys: 0, priceRowsDeduplicated: 0, latestPricesResolved: 0, pricesPublished: 0, pricesDeactivated: 0, unmatchedProducts: 0, unknownPriceTypes: 0, scanComplete: false, errorCategory: null, failedStage: null, databaseErrorCode: null, safeError: null, failedPage: null, activeChunkToken: null, chunkStartedAt: null, lastPageStage: null, lastPageNumber: null, lastPageFingerprint: null, lastPageFirstKey: null, lastPageLastKey: null, retryCount: 0, odataRequestCount: 0, odataRequestDurationMs: 0, stagingDurationMs: 0, publicationDurationMs: 0, updatedAt: now, ...overrides };
  const store = {
    state,
    start: vi.fn(async () => ({ state, started: true })),
    getState: vi.fn(async () => state),
    claimChunk: vi.fn(async () => true),
    releaseChunk: vi.fn(async () => undefined),
    stagePriceTypes: vi.fn(async (_id, rows) => rows.length),
    stageCurrencies: vi.fn(async (_id, rows) => rows.length),
    stagePrices: vi.fn(async (_id, rows) => rows.length),
    stageRetailHistory: vi.fn(async (_id, rows) => rows.length),
    checkpoint: vi.fn(async (_id: string, input: { stage: PriceSyncStage; processedStage?: PriceSyncStage; pageNumber?: number; pageIntegrity?: ReturnType<typeof integrity>; nextSkip: number; rowsScanned: number; rowsStaged: number; pageCompleted: boolean; scanComplete?: boolean; priceDiagnostics?: { received: number; uniqueKeys: number; duplicateKeys: number; rowsDeduplicated: number }; retryCount?: number; requestCount?: number; requestDurationMs?: number; stagingDurationMs?: number }) => { state.status = "running"; state.currentStage = input.stage; state.nextSkip = input.nextSkip; state.pagesProcessed += input.pageCompleted ? 1 : 0; state.rowsScanned += input.rowsScanned; state.rowsStaged += input.rowsStaged; state.priceRowsReceived += input.priceDiagnostics?.received ?? 0; state.priceUniqueKeys += input.priceDiagnostics?.uniqueKeys ?? 0; state.priceDuplicateKeys += input.priceDiagnostics?.duplicateKeys ?? 0; state.priceRowsDeduplicated += input.priceDiagnostics?.rowsDeduplicated ?? 0; state.scanComplete = input.scanComplete ?? state.scanComplete; if (input.pageCompleted) { state.lastPageStage = input.processedStage ?? null; state.lastPageNumber = input.pageNumber ?? null; state.lastPageFingerprint = input.pageIntegrity?.fingerprint ?? null; state.lastPageFirstKey = input.pageIntegrity?.firstStableKey ?? null; state.lastPageLastKey = input.pageIntegrity?.lastStableKey ?? null; } state.retryCount += input.retryCount ?? 0; state.odataRequestCount += input.requestCount ?? 0; state.odataRequestDurationMs += input.requestDurationMs ?? 0; state.stagingDurationMs += input.stagingDurationMs ?? 0; }),
    publish: vi.fn(async () => { state.status = "succeeded"; state.activeSyncId = null; state.currentStage = "completed"; }),
    fail: vi.fn(async (_id, category, stage, page) => { state.status = "failed"; state.activeSyncId = null; state.errorCategory = category; state.failedStage = stage; state.failedPage = page; }),
    failLaunch: vi.fn(async (_id, safeError) => { state.status = "failed"; state.activeSyncId = null; state.errorCategory = "orchestration_failure"; state.failedStage = "continuation_launch"; state.safeError = safeError; }),
  } satisfies PriceSyncStateStore & { state: PriceSyncState };
  return store;
}

const syncId = "11111111-1111-4111-8111-111111111111";
const now = "2026-07-12T12:00:00.000Z";
function priceRow(overrides: Partial<PriceRegisterStageRow> = {}): PriceRegisterStageRow { return { externalProductRef: "product", externalPriceTypeRef: "type", externalCharacteristicRef: "00000000-0000-0000-0000-000000000000", amount: 100, isCurrent: true, effectiveAt: "2026-01-01T00:00:00Z", ...overrides }; }
function integrity(fingerprint: string) { return { fingerprint, firstStableKey: fingerprint, lastStableKey: fingerprint }; }
function httpError(statusCode: number, retryAfterMs: number | null = null) { return Object.assign(new Error(`HTTP ${statusCode}`), { diagnostic: { failedStage: "odata_response", receivedContentType: "application/json", requestKind: "pricing_chunk_scan", resourceName: "prices", queryParameterNames: ["$top", "$skip"], statusCode, jsonParseFailure: false, parseErrorName: null, bodyLength: 20, bomDetected: false, emptyBody: false, retryAfterMs, safeErrorSummary: "upstream_error" } }); }

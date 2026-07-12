import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
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

function providerFixture(options: { priceRows?: number } = {}) {
  return {
    fetchPriceTypes: vi.fn(async () => ({ items: [], rowCount: 0 })),
    fetchCurrencies: vi.fn(async () => ({ items: [], rowCount: 0 })),
    fetchPrices: vi.fn(async () => ({ items: [] as PriceRegisterStageRow[], rowCount: options.priceRows ?? 0 })),
  } satisfies PriceChunkProvider;
}

function storeFixture(overrides: Partial<PriceSyncState> = {}) {
  const state: PriceSyncState = { status: "running", activeSyncId: syncId, startedAt: now, finishedAt: null, lastSuccessfulSyncAt: null, currentStage: "price_type_scan", nextSkip: 0, pageSize: 500, pagesProcessed: 0, rowsScanned: 0, rowsStaged: 0, latestPricesResolved: 0, pricesPublished: 0, pricesDeactivated: 0, unmatchedProducts: 0, unknownPriceTypes: 0, scanComplete: false, errorCategory: null, failedStage: null, databaseErrorCode: null, safeError: null, failedPage: null, activeChunkToken: null, chunkStartedAt: null, updatedAt: now, ...overrides };
  const store = {
    state,
    start: vi.fn(async () => ({ state, started: true })),
    getState: vi.fn(async () => state),
    claimChunk: vi.fn(async () => true),
    releaseChunk: vi.fn(async () => undefined),
    stagePriceTypes: vi.fn(async (_id, rows) => rows.length),
    stageCurrencies: vi.fn(async (_id, rows) => rows.length),
    stagePrices: vi.fn(async (_id, rows) => rows.length),
    checkpoint: vi.fn(async (_id: string, input: { stage: PriceSyncStage; nextSkip: number; rowsScanned: number; rowsStaged: number; pageCompleted: boolean; scanComplete?: boolean }) => { state.status = "running"; state.currentStage = input.stage; state.nextSkip = input.nextSkip; state.pagesProcessed += 1; state.rowsScanned += input.rowsScanned; state.rowsStaged += input.rowsStaged; state.scanComplete = input.scanComplete ?? state.scanComplete; }),
    publish: vi.fn(async () => { state.status = "succeeded"; state.activeSyncId = null; state.currentStage = "completed"; }),
    fail: vi.fn(async (_id, category, stage, page) => { state.status = "failed"; state.activeSyncId = null; state.errorCategory = category; state.failedStage = stage; state.failedPage = page; }),
    failLaunch: vi.fn(async (_id, safeError) => { state.status = "failed"; state.activeSyncId = null; state.errorCategory = "orchestration_failure"; state.failedStage = "continuation_launch"; state.safeError = safeError; }),
  } satisfies PriceSyncStateStore & { state: PriceSyncState };
  return store;
}

const syncId = "11111111-1111-4111-8111-111111111111";
const now = "2026-07-12T12:00:00.000Z";

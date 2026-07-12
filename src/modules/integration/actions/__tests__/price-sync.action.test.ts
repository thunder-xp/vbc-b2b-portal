import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ ensureActiveUser: vi.fn(), getUserId: vi.fn(), start: vi.fn(), getState: vi.fn(), failLaunch: vi.fn(), launch: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ host: "portal.example", "x-forwarded-proto": "https" })) }));
vi.mock("../../../access-control/actions/service-factory", () => ({ getAuthenticatedUserId: mocks.getUserId, createUserProfileService: () => ({ ensureActiveUser: mocks.ensureActiveUser }) }));
vi.mock("../../services", () => ({ createChunkedPriceSyncService: () => ({ start: mocks.start, getState: mocks.getState, failLaunch: mocks.failLaunch }) }));
vi.mock("../../sync/price-sync-continuation", () => ({ launchPriceSync: mocks.launch, PriceSyncLaunchError: class PriceSyncLaunchError extends Error { safeMessage = "launch failed"; } }));
vi.mock("../../../../lib/env", () => ({ getOneCEnv: () => ({}) }));

import { getPriceSyncStateAction, syncPricesFromOneCAction } from "../price-sync.action";
import { PriceSyncLaunchError } from "../../sync/price-sync-continuation";

describe("price sync actions", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getUserId.mockResolvedValue("user"); mocks.ensureActiveUser.mockResolvedValue({ userType: "internal" }); mocks.start.mockResolvedValue({ started: true, state }); mocks.getState.mockResolvedValue(state); mocks.launch.mockResolvedValue({ status: 202 }); });

  it("returns queued state before the full scan starts", async () => {
    const result = await syncPricesFromOneCAction();
    expect(result).toMatchObject({ success: true, data: { status: "queued" } });
    expect(mocks.launch).toHaveBeenCalledWith(state.activeSyncId, "https://portal.example");
  });

  it("reads persisted state without contacting 1C", async () => {
    const result = await getPriceSyncStateAction();
    expect(result).toMatchObject({ success: true, data: state });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("marks launch failure instead of leaving the job queued", async () => {
    mocks.launch.mockRejectedValueOnce(new PriceSyncLaunchError("launch failed"));
    await expect(syncPricesFromOneCAction()).resolves.toMatchObject({ success: false });
    expect(mocks.failLaunch).toHaveBeenCalledWith(state.activeSyncId, "launch failed");
  });

  it("completes after launch acceptance without waiting for the worker", async () => { const started = Date.now(); await syncPricesFromOneCAction(); expect(Date.now() - started).toBeLessThan(5000); });
});

const state = { status: "queued", activeSyncId: "11111111-1111-4111-8111-111111111111", startedAt: "2026-07-12T12:00:00.000Z", finishedAt: null, lastSuccessfulSyncAt: null, currentStage: "price_type_scan", nextSkip: 0, pageSize: 500, pagesProcessed: 0, rowsScanned: 0, rowsStaged: 0, latestPricesResolved: 0, pricesPublished: 0, pricesDeactivated: 0, unmatchedProducts: 0, unknownPriceTypes: 0, scanComplete: false, errorCategory: null, failedStage: null, databaseErrorCode: null, safeError: null, failedPage: null, activeChunkToken: null, chunkStartedAt: null, updatedAt: "2026-07-12T12:00:00.000Z" };

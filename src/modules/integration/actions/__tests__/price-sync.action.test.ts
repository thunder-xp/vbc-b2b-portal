import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ after: vi.fn(), ensureActiveUser: vi.fn(), getUserId: vi.fn(), start: vi.fn(), getState: vi.fn(), invoke: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ host: "portal.example", "x-forwarded-proto": "https" })) }));
vi.mock("../../../access-control/actions/service-factory", () => ({ getAuthenticatedUserId: mocks.getUserId, createUserProfileService: () => ({ ensureActiveUser: mocks.ensureActiveUser }) }));
vi.mock("../../services", () => ({ createChunkedPriceSyncService: () => ({ start: mocks.start, getState: mocks.getState }) }));
vi.mock("../../sync/price-sync-continuation", () => ({ invokePriceSyncContinuation: mocks.invoke }));
vi.mock("../../../../lib/env", () => ({ getOneCEnv: () => ({}) }));

import { getPriceSyncStateAction, syncPricesFromOneCAction } from "../price-sync.action";

describe("price sync actions", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getUserId.mockResolvedValue("user"); mocks.ensureActiveUser.mockResolvedValue({ userType: "internal" }); mocks.start.mockResolvedValue({ started: true, state }); mocks.getState.mockResolvedValue(state); });

  it("returns queued state before the full scan starts", async () => {
    const result = await syncPricesFromOneCAction();
    expect(result).toMatchObject({ success: true, data: { status: "queued" } });
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("reads persisted state without contacting 1C", async () => {
    const result = await getPriceSyncStateAction();
    expect(result).toMatchObject({ success: true, data: state });
    expect(mocks.start).not.toHaveBeenCalled();
  });
});

const state = { status: "queued", activeSyncId: "11111111-1111-4111-8111-111111111111", startedAt: "2026-07-12T12:00:00.000Z", finishedAt: null, lastSuccessfulSyncAt: null, currentStage: "price_type_scan", nextSkip: 0, pageSize: 500, pagesProcessed: 0, rowsScanned: 0, rowsStaged: 0, latestPricesResolved: 0, pricesPublished: 0, pricesDeactivated: 0, unmatchedProducts: 0, unknownPriceTypes: 0, scanComplete: false, errorCategory: null, failedStage: null, databaseErrorCode: null, failedPage: null, updatedAt: "2026-07-12T12:00:00.000Z" };

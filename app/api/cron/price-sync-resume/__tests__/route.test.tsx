import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getState: vi.fn(), continueSync: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/env", () => ({ getOneCEnv: () => ({}) }));
vi.mock("@/src/modules/integration/services", () => ({ createChunkedPriceSyncService: () => ({ getState: mocks.getState, continue: mocks.continueSync }) }));

import { GET } from "../route";

describe("price sync cron resumer", () => {
  beforeEach(() => { vi.stubEnv("CRON_SECRET", "cron-secret"); mocks.getState.mockResolvedValue(state); mocks.continueSync.mockResolvedValue({ state, needsContinuation: true, pagesProcessedThisInvocation: 1 }); });
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

  it("resumes a queued job", async () => { const response = await GET(request()); expect(response.status).toBe(200); expect(mocks.continueSync).toHaveBeenCalledWith(state.activeSyncId); });
  it("does nothing without a queued or running job", async () => { mocks.getState.mockResolvedValue({ ...state, status: "succeeded", activeSyncId: null }); await GET(request()); expect(mocks.continueSync).not.toHaveBeenCalled(); });
  it("ignores a fresh active claim", async () => { mocks.continueSync.mockResolvedValue({ state: { ...state, activeChunkToken: "fresh" }, needsContinuation: false, pagesProcessedThisInvocation: 0 }); const response = await GET(request()); await expect(response.json()).resolves.toMatchObject({ resumed: false }); });
  it("recovers a stale claim through the atomic service claim", async () => { mocks.continueSync.mockResolvedValue({ state, needsContinuation: true, pagesProcessedThisInvocation: 2 }); const response = await GET(request()); await expect(response.json()).resolves.toMatchObject({ resumed: true, pagesProcessed: 2 }); });
});

function request() { return new Request("https://portal.example/api/cron/price-sync-resume", { headers: { authorization: "Bearer cron-secret" } }); }
const state = { status: "queued", activeSyncId: "11111111-1111-4111-8111-111111111111", currentStage: "price_type_scan", nextSkip: 0, pagesProcessed: 0, rowsScanned: 0, activeChunkToken: null };

import { beforeEach, describe, expect, it, vi } from "vitest";

const syncId = "11111111-1111-4111-8111-111111111111";
const mocks = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => Promise<void>>,
  getState: vi.fn(),
  continueSync: vi.fn(),
  launch: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: (callback: () => Promise<void>) => mocks.afterCallbacks.push(callback),
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));
vi.mock("@/src/lib/env", () => ({ getOneCEnv: () => ({}) }));
vi.mock("@/src/modules/integration/services", () => ({
  createChunkedPriceSyncService: () => ({ getState: mocks.getState, continue: mocks.continueSync }),
}));
vi.mock("@/src/modules/integration/sync/price-sync-continuation", () => ({
  launchPriceSync: mocks.launch,
}));

import { POST } from "../price-sync/route";

describe("internal price worker route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCallbacks.length = 0;
    vi.stubEnv("PRICE_SYNC_SECRET", "secret");
    mocks.getState.mockResolvedValue({ activeSyncId: syncId, status: "running", currentStage: "price_register_scan", nextSkip: 0, pagesProcessed: 0, rowsScanned: 0 });
    mocks.continueSync.mockResolvedValue({ pagesProcessedThisInvocation: 5, needsContinuation: true, state: { status: "running", currentStage: "price_register_scan" } });
    mocks.launch.mockResolvedValue({ status: 202 });
  });

  it("responds before processing and immediately chains the next bounded chunk", async () => {
    const response = await POST(request("secret"));
    expect(response.status).toBe(202);
    expect(mocks.continueSync).not.toHaveBeenCalled();
    await mocks.afterCallbacks[0]!();
    expect(mocks.continueSync).toHaveBeenCalledOnce();
    expect(mocks.launch).toHaveBeenCalledWith(syncId, "https://portal.example", 1);
  });

  it("stops the immediate chain when the bounded hop budget is exhausted", async () => {
    await POST(request("secret", 0));
    await mocks.afterCallbacks[0]!();
    expect(mocks.continueSync).toHaveBeenCalledOnce();
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it("does not relaunch after the terminal chunk", async () => {
    mocks.continueSync.mockResolvedValueOnce({ pagesProcessedThisInvocation: 3, needsContinuation: false, state: { status: "succeeded", currentStage: "completed" } });
    await POST(request("secret"));
    await mocks.afterCallbacks[0]!();
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it("leaves an active sync for the scheduled watchdog when an immediate handoff fails", async () => {
    mocks.launch.mockRejectedValueOnce(new Error("handoff failed"));
    await POST(request("secret"));
    await expect(mocks.afterCallbacks[0]!()).resolves.toBeUndefined();
  });
});

function request(secret: string, continuationHopsRemaining = 2) {
  return new Request("https://portal.example/api/internal/price-sync", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ syncId, continuationHopsRemaining }),
  });
}

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => Promise<void>>,
  start: vi.fn(),
  failLaunch: vi.fn(),
  launch: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: (callback: () => Promise<void>) => mocks.afterCallbacks.push(callback),
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));
vi.mock("@/src/lib/env", () => ({ getOneCEnv: () => ({}) }));
vi.mock("@/src/modules/integration/services", () => ({
  createChunkedPriceSyncService: () => ({
    start: mocks.start,
    failLaunch: mocks.failLaunch,
  }),
}));
vi.mock("@/src/modules/integration/sync/price-sync-continuation", () => ({
  launchPriceSync: mocks.launch,
  PriceSyncLaunchError: class PriceSyncLaunchError extends Error {
    readonly safeMessage = "safe";
  },
}));

import { GET } from "../route";

describe("price synchronization daily start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCallbacks.length = 0;
    vi.stubEnv("CRON_SECRET", "cron-secret");
    mocks.start.mockResolvedValue({
      started: true,
      state: { activeSyncId: "price-sync-1" },
    });
  });

  it("rejects unauthenticated callers", async () => {
    expect((await GET(new Request("https://portal.example/api/cron/price-sync-start"))).status).toBe(401);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("acknowledges the start before launching the resumable worker", async () => {
    const response = await GET(request());
    expect(response.status).toBe(202);
    expect(mocks.launch).not.toHaveBeenCalled();
    await mocks.afterCallbacks[0]!();
    expect(mocks.launch).toHaveBeenCalledWith("price-sync-1", "https://portal.example");
  });

  it("does not launch a second run when the database lock is held", async () => {
    mocks.start.mockResolvedValue({
      started: false,
      state: { activeSyncId: "existing-price-sync" },
    });
    expect((await GET(request())).status).toBe(202);
    expect(mocks.afterCallbacks).toHaveLength(0);
  });
});

function request() {
  return new Request("https://portal.example/api/cron/price-sync-start", {
    headers: { authorization: "Bearer cron-secret" },
  });
}

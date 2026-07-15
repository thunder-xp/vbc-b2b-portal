import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => Promise<void>>,
  acquire: vi.fn(),
  release: vi.fn(),
  exchangeSync: vi.fn(),
  stockStart: vi.fn(),
  stockFailLaunch: vi.fn(),
  launchStock: vi.fn(),
  refreshActive: vi.fn(),
  refreshHistories: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: (callback: () => Promise<void>) => mocks.afterCallbacks.push(callback),
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));
vi.mock("@/src/modules/integration/sync", () => ({ acquireSyncRunLock: mocks.acquire, releaseSyncRunLock: mocks.release }));
vi.mock("@/src/modules/integration/sync/stock-sync-launcher", () => ({ launchStockSync: mocks.launchStock }));
vi.mock("@/src/modules/integration/services", () => ({
  createExchangeRateSyncService: () => ({ sync: mocks.exchangeSync }),
  createChunkedStockSyncService: () => ({ start: mocks.stockStart, failLaunch: mocks.stockFailLaunch }),
}));
vi.mock("@/src/modules/orders/actions/service-factory", () => ({
  createPartnerOrderHistoryAutomationService: () => ({ refreshActiveOrders: mocks.refreshActive, refreshCompanyHistories: mocks.refreshHistories }),
}));
vi.mock("@/src/lib/env", () => ({ getOneCEnv: () => ({}) }));

import { GET as currencyCron } from "../commercial-rate/route";
import { GET as stockCron } from "../stock-sync-start/route";
import { GET as activeOrderCron } from "../active-order-refresh/route";
import { GET as historyCron } from "../order-history-refresh/route";

describe("commercial freshness cron routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCallbacks.length = 0;
    vi.stubEnv("CRON_SECRET", "cron-secret");
    mocks.acquire.mockResolvedValue("acquired");
    mocks.release.mockResolvedValue(undefined);
    mocks.stockStart.mockResolvedValue({ started: true, state: { activeSyncId: "sync-1" } });
    mocks.exchangeSync.mockResolvedValue({ sourceDocumentDate: "2026-07-15T00:00:00Z" });
    mocks.refreshActive.mockResolvedValue({ received: 0 });
    mocks.refreshHistories.mockResolvedValue({ companies: 0, completed: 0, skipped: 0, failed: 0 });
  });

  it.each([
    ["currency", currencyCron],
    ["stock", stockCron],
    ["active orders", activeOrderCron],
    ["history", historyCron],
  ])("rejects unauthorized %s requests before service work", async (_name, handler) => {
    const response = await handler(new Request("https://portal.example/api/cron/test"));
    expect(response.status).toBe(401);
    expect(mocks.acquire).not.toHaveBeenCalled();
    expect(mocks.stockStart).not.toHaveBeenCalled();
  });

  it("starts currency publication after the response and preserves lock ownership", async () => {
    const response = await currencyCron(request());
    expect(response.status).toBe(202);
    expect(mocks.exchangeSync).not.toHaveBeenCalled();
    await mocks.afterCallbacks[0]!();
    expect(mocks.exchangeSync).toHaveBeenCalledTimes(1);
    expect(mocks.release).toHaveBeenCalledWith("commercial_rate", expect.any(String));
  });

  it("skips a locked stock run without launching a worker", async () => {
    mocks.stockStart.mockResolvedValue({ started: false, state: { activeSyncId: "existing" } });
    const response = await stockCron(request());
    expect(response.status).toBe(202);
    expect(mocks.afterCallbacks).toHaveLength(0);
    expect(mocks.launchStock).not.toHaveBeenCalled();
  });

  it("acknowledges stock start before launching the continuation worker", async () => {
    await stockCron(request());
    expect(mocks.launchStock).not.toHaveBeenCalled();
    await mocks.afterCallbacks[0]!();
    expect(mocks.launchStock).toHaveBeenCalledWith("sync-1", "https://portal.example");
  });

  it("does not schedule active or full history work when the database lock is held", async () => {
    mocks.acquire.mockResolvedValue("locked");
    expect((await activeOrderCron(request())).status).toBe(202);
    expect((await historyCron(request())).status).toBe(202);
    expect(mocks.afterCallbacks).toHaveLength(0);
  });
});

function request() {
  return new Request("https://portal.example/api/cron/test", { headers: { authorization: "Bearer cron-secret" } });
}

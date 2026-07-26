import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "../../../access-control/services";

const mocks = vi.hoisted(() => ({
  requireAdminPermission: vi.fn(),
  ensureActiveUser: vi.fn(),
  rateSync: vi.fn(),
  priceStart: vi.fn(),
  priceFailLaunch: vi.fn(),
  stockStart: vi.fn(),
  stockFailLaunch: vi.fn(),
  launchPrice: vi.fn(),
  launchStock: vi.fn(),
}));
vi.mock("../../../admin/services", () => ({
  requireAdminPermission: mocks.requireAdminPermission,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "portal.example", "x-forwarded-proto": "https" }),
}));
vi.mock("../../../../lib/env", () => ({ getOneCEnv: () => ({}) }));
vi.mock("../../../access-control/actions/service-factory", () => ({
  getAuthenticatedUserId: async () => "internal-1",
  createUserProfileService: () => ({ ensureActiveUser: mocks.ensureActiveUser }),
}));
vi.mock("../../services", () => ({
  createExchangeRateSyncService: () => ({ sync: mocks.rateSync }),
  createChunkedPriceSyncService: () => ({
    start: mocks.priceStart,
    failLaunch: mocks.priceFailLaunch,
  }),
  createChunkedStockSyncService: () => ({
    start: mocks.stockStart,
    failLaunch: mocks.stockFailLaunch,
  }),
}));
vi.mock("../../sync/price-sync-continuation", () => ({
  launchPriceSync: mocks.launchPrice,
  PriceSyncLaunchError: class PriceSyncLaunchError extends Error { readonly safeMessage = "safe"; },
}));
vi.mock("../../sync/stock-sync-launcher", () => ({
  launchStockSync: mocks.launchStock,
  StockLaunchError: class StockLaunchError extends Error { readonly safeMessage = "safe"; },
}));

import { UserType } from "../../../access-control/types";
import { syncAllCommercialDataAction } from "../commercial-sync-all.action";

describe("manual commercial synchronization sequence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminPermission.mockResolvedValue({});
    mocks.ensureActiveUser.mockResolvedValue({ userType: UserType.Internal });
    mocks.rateSync.mockResolvedValue({});
    mocks.priceStart.mockResolvedValue({ started: true, state: { activeSyncId: "price-1" } });
    mocks.stockStart.mockResolvedValue({ started: true, state: { activeSyncId: "stock-1" } });
  });

  it("runs rates before queuing prices and defers stock to price completion", async () => {
    const result = await syncAllCommercialDataAction();
    expect(result.success).toBe(true);
    expect(mocks.rateSync.mock.invocationCallOrder[0]).toBeLessThan(mocks.priceStart.mock.invocationCallOrder[0]!);
    expect(mocks.launchPrice).toHaveBeenCalledWith("price-1", "https://portal.example");
    expect(mocks.stockStart).not.toHaveBeenCalled();
    if (result.success) expect(result.data).toEqual({
      rates: "completed",
      prices: "queued",
      stock: "deferred",
      arrivals: "deferred",
    });
  });

  it("does not publish prices after a failed rate check but keeps independent stock moving", async () => {
    mocks.rateSync.mockRejectedValue(new Error("rate unavailable"));
    const result = await syncAllCommercialDataAction();
    expect(result.success).toBe(true);
    expect(mocks.priceStart).not.toHaveBeenCalled();
    expect(mocks.launchStock).toHaveBeenCalledWith("stock-1", "https://portal.example");
    if (result.success) expect(result.data).toEqual({
      rates: "failed",
      prices: "deferred",
      stock: "queued",
      arrivals: "queued",
    });
  });

  it("does not allow partner users to trigger synchronization", async () => {
    mocks.requireAdminPermission.mockRejectedValueOnce(new ForbiddenError());
    const result = await syncAllCommercialDataAction();
    expect(result.success).toBe(false);
    expect(mocks.rateSync).not.toHaveBeenCalled();
  });
});

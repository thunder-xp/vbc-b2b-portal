import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserStatus, UserType } from "../../../access-control/types";
import { UnauthenticatedError } from "../../../access-control/services";

const mocks = vi.hoisted(() => ({
  getOneCEnv: vi.fn(),
  getAuthenticatedUserId: vi.fn<() => Promise<string>>(),
  createUserProfileService: vi.fn(),
  ensureActiveUser: vi.fn(),
  createCatalogSyncEngine: vi.fn(),
  createPriceSyncEngine: vi.fn(),
  createStockSyncEngine: vi.fn(),
  syncCatalog: vi.fn(),
  syncPrices: vi.fn(),
  syncStock: vi.fn(),
}));

vi.mock("../../../../lib/env", () => ({
  getOneCEnv: mocks.getOneCEnv,
}));

vi.mock("../../../access-control/actions/service-factory", () => ({
  getAuthenticatedUserId: mocks.getAuthenticatedUserId,
  createUserProfileService: mocks.createUserProfileService,
}));

vi.mock("../../services", () => ({
  createCatalogSyncEngine: mocks.createCatalogSyncEngine,
  createPriceSyncEngine: mocks.createPriceSyncEngine,
  createStockSyncEngine: mocks.createStockSyncEngine,
}));

import { syncCatalogFromOneCAction } from "../catalog-sync.action";
import { syncPricesFromOneCAction } from "../price-sync.action";
import { syncStockFromOneCAction } from "../stock-sync.action";

describe("syncCatalogFromOneCAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUserId.mockResolvedValue("user-1");
    mocks.createCatalogSyncEngine.mockReturnValue({
      syncCatalog: mocks.syncCatalog,
    });
    mocks.createPriceSyncEngine.mockReturnValue({
      syncPrices: mocks.syncPrices,
    });
    mocks.createStockSyncEngine.mockReturnValue({
      syncStock: mocks.syncStock,
    });
    mocks.createUserProfileService.mockReturnValue({
      ensureActiveUser: mocks.ensureActiveUser,
    });
    mocks.ensureActiveUser.mockResolvedValue(makeProfile(UserType.Admin));
    mocks.getOneCEnv.mockReturnValue({
      baseUrl: null,
      apiToken: null,
      username: null,
      password: null,
      catalogCategoriesPath: "/catalog/categories",
      catalogBrandsPath: "/catalog/brands",
      catalogProductsPath: "/catalog/products",
      authMode: "none",
      useMockCatalog: true,
    });
    mocks.syncCatalog.mockResolvedValue({
      provider: "one-c",
      target: "catalog",
      status: "succeeded",
      startedAt: "2026-07-09T00:00:00.000Z",
      finishedAt: "2026-07-09T00:00:00.001Z",
      durationMs: 1,
      categoriesReceived: 1,
      categoriesCreated: 1,
      categoriesUpdated: 0,
      brandsReceived: 1,
      brandsCreated: 1,
      brandsUpdated: 0,
      productsReceived: 1,
      productsCreated: 1,
      productsUpdated: 0,
      failed: 0,
      errors: [],
    });
    mocks.syncPrices.mockResolvedValue({
      provider: "one-c",
      target: "pricing",
      status: "succeeded",
      startedAt: "2026-07-09T00:00:00.000Z",
      finishedAt: "2026-07-09T00:00:00.001Z",
      durationMs: 1,
      pricesReceived: 1,
      pricesCreated: 1,
      pricesUpdated: 0,
      pricesSkipped: 0,
      failed: 0,
      errors: [],
      warnings: [],
    });
    mocks.syncStock.mockResolvedValue({
      provider: "one-c",
      target: "inventory",
      status: "succeeded",
      startedAt: "2026-07-09T00:00:00.000Z",
      finishedAt: "2026-07-09T00:00:00.001Z",
      durationMs: 1,
      stockReceived: 1,
      stockCreated: 1,
      stockUpdated: 0,
      stockSkipped: 0,
      failed: 0,
      errors: [],
      warnings: [],
    });
  });

  it("returns a safe error when unauthenticated", async () => {
    mocks.getAuthenticatedUserId.mockRejectedValue(new UnauthenticatedError());

    await expect(syncCatalogFromOneCAction()).resolves.toMatchObject({
      success: false,
      errorCode: "AUTH_REQUIRED",
    });
    expect(mocks.syncCatalog).not.toHaveBeenCalled();
  });

  it("rejects partner users", async () => {
    mocks.ensureActiveUser.mockResolvedValue(makeProfile(UserType.External));

    await expect(syncCatalogFromOneCAction()).resolves.toMatchObject({
      success: false,
      errorCode: "FORBIDDEN",
    });
    expect(mocks.syncCatalog).not.toHaveBeenCalled();
  });

  it("runs catalog sync for active internal admins", async () => {
    const result = await syncCatalogFromOneCAction();

    expect(result).toMatchObject({
      success: true,
      data: {
        provider: "one-c",
        target: "catalog",
        status: "succeeded",
      },
    });
    expect(mocks.syncCatalog).toHaveBeenCalledOnce();
  });

  it("runs catalog sync for active internal users", async () => {
    mocks.ensureActiveUser.mockResolvedValue(makeProfile(UserType.Internal));

    const result = await syncCatalogFromOneCAction();

    expect(result).toMatchObject({
      success: true,
      data: {
        provider: "one-c",
        target: "catalog",
        status: "succeeded",
      },
    });
    expect(mocks.syncCatalog).toHaveBeenCalledOnce();
  });

  it("returns a safe price sync error when unauthenticated", async () => {
    mocks.getAuthenticatedUserId.mockRejectedValue(new UnauthenticatedError());

    await expect(syncPricesFromOneCAction()).resolves.toMatchObject({
      success: false,
      errorCode: "AUTH_REQUIRED",
    });
    expect(mocks.syncPrices).not.toHaveBeenCalled();
  });

  it("rejects partner users from price sync", async () => {
    mocks.ensureActiveUser.mockResolvedValue(makeProfile(UserType.External));

    await expect(syncPricesFromOneCAction()).resolves.toMatchObject({
      success: false,
      errorCode: "FORBIDDEN",
    });
    expect(mocks.syncPrices).not.toHaveBeenCalled();
  });

  it("runs price sync for active internal admins", async () => {
    const result = await syncPricesFromOneCAction();

    expect(result).toMatchObject({
      success: true,
      data: {
        provider: "one-c",
        target: "pricing",
        status: "succeeded",
      },
    });
    expect(mocks.syncPrices).toHaveBeenCalledOnce();
  });

  it("returns a safe stock sync error when unauthenticated", async () => {
    mocks.getAuthenticatedUserId.mockRejectedValue(new UnauthenticatedError());

    await expect(syncStockFromOneCAction()).resolves.toMatchObject({
      success: false,
      errorCode: "AUTH_REQUIRED",
    });
    expect(mocks.syncStock).not.toHaveBeenCalled();
  });

  it("rejects partner users from stock sync", async () => {
    mocks.ensureActiveUser.mockResolvedValue(makeProfile(UserType.External));

    await expect(syncStockFromOneCAction()).resolves.toMatchObject({
      success: false,
      errorCode: "FORBIDDEN",
    });
    expect(mocks.syncStock).not.toHaveBeenCalled();
  });

  it("runs stock sync for active internal admins", async () => {
    const result = await syncStockFromOneCAction();

    expect(result).toMatchObject({
      success: true,
      data: {
        provider: "one-c",
        target: "inventory",
        status: "succeeded",
      },
    });
    expect(mocks.syncStock).toHaveBeenCalledOnce();
  });
});

function makeProfile(userType: UserType) {
  return {
    id: "user-1",
    email: "user@example.com",
    fullName: "User",
    phone: null,
    userType,
    status: UserStatus.Active,
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
  };
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UserStatus, UserType } from "../../../access-control/types";
import { UnauthenticatedError } from "../../../access-control/services";
import {
  IntegrationProviderUnavailableError,
  IntegrationTimeoutError,
  IntegrationValidationError,
} from "../../errors";

const mocks = vi.hoisted(() => ({
  getOneCEnv: vi.fn(),
  getAuthenticatedUserId: vi.fn<() => Promise<string>>(),
  createUserProfileService: vi.fn(),
  ensureActiveUser: vi.fn(),
  createCatalogSyncEngine: vi.fn(),
  createCatalogSyncStateReader: vi.fn(),
  createPartnerLookupService: vi.fn(),
  createPriceSyncEngine: vi.fn(),
  createChunkedPriceSyncService: vi.fn(),
  createStockSyncEngine: vi.fn(),
  createChunkedStockSyncService: vi.fn(),
  startStockSync: vi.fn(),
  failStockLaunch: vi.fn(),
  launchStockSync: vi.fn(),
  searchPartners: vi.fn(),
  syncCatalog: vi.fn(),
  syncPrices: vi.fn(),
  startPriceSync: vi.fn(),
  launchPriceSync: vi.fn(),
  failPriceLaunch: vi.fn(),
  syncStock: vi.fn(),
}));
vi.mock("../../sync/price-sync-continuation", () => ({ launchPriceSync: mocks.launchPriceSync, PriceSyncLaunchError: class PriceSyncLaunchError extends Error { safeMessage = "launch failed"; } }));
vi.mock("../../sync/stock-sync-launcher", () => ({ launchStockSync: mocks.launchStockSync, StockLaunchError: class StockLaunchError extends Error { safeMessage = "launch failed"; } }));

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ host: "portal.example", "x-forwarded-proto": "https" })) }));

vi.mock("../../../../lib/env", () => ({
  getOneCEnv: mocks.getOneCEnv,
}));

vi.mock("../../../access-control/actions/service-factory", () => ({
  getAuthenticatedUserId: mocks.getAuthenticatedUserId,
  createUserProfileService: mocks.createUserProfileService,
}));

vi.mock("../../services", () => ({
  createCatalogSyncEngine: mocks.createCatalogSyncEngine,
  createCatalogSyncStateReader: mocks.createCatalogSyncStateReader,
  createPartnerLookupService: mocks.createPartnerLookupService,
  createPriceSyncEngine: mocks.createPriceSyncEngine,
  createChunkedPriceSyncService: mocks.createChunkedPriceSyncService,
  createStockSyncEngine: mocks.createStockSyncEngine,
  createChunkedStockSyncService: mocks.createChunkedStockSyncService,
}));

import { syncCatalogFromOneCAction } from "../catalog-sync.action";
import { searchOneCPartnersAction } from "../partner-search.action";
import { syncPricesFromOneCAction } from "../price-sync.action";
import { syncStockFromOneCAction } from "../stock-sync.action";

describe("syncCatalogFromOneCAction", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUserId.mockResolvedValue("user-1");
    mocks.createCatalogSyncEngine.mockReturnValue({
      syncCatalog: mocks.syncCatalog,
    });
    mocks.createPriceSyncEngine.mockReturnValue({
      syncPrices: mocks.syncPrices,
    });
    mocks.createChunkedPriceSyncService.mockReturnValue({
      start: mocks.startPriceSync,
      failLaunch: mocks.failPriceLaunch,
    });
    mocks.createPartnerLookupService.mockReturnValue({
      searchPartners: mocks.searchPartners,
    });
    mocks.createStockSyncEngine.mockReturnValue({
      syncStock: mocks.syncStock,
    });
    mocks.createChunkedStockSyncService.mockReturnValue({ start: mocks.startStockSync, failLaunch: mocks.failStockLaunch });
    mocks.createUserProfileService.mockReturnValue({
      ensureActiveUser: mocks.ensureActiveUser,
    });
    mocks.ensureActiveUser.mockResolvedValue(makeProfile(UserType.Admin));
    mocks.getOneCEnv.mockReturnValue({
      baseUrl: null,
      username: null,
      password: null,
      catalogCategoriesPath: "/catalog/categories",
      catalogBrandsPath: "/catalog/brands",
      catalogProductsPath: "/catalog/products",
      productPricesPath: "/pricing/product-prices",
      stockBalancesPath: "/inventory/stock-balances",
      partnerSearchPageSize: 50,
      partnerSearchMaxPages: 10,
      requestTimeoutMs: 10000,
      authMode: "none",
      useMockCatalog: true,
      useMockPricing: true,
      useMockInventory: true,
      useMockPartners: true,
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
    mocks.startPriceSync.mockResolvedValue({ started: true, state: { status: "queued", activeSyncId: "11111111-1111-4111-8111-111111111111" } });
    mocks.launchPriceSync.mockResolvedValue({ status: 202 });
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
    mocks.startStockSync.mockResolvedValue({ started: true, state: { status: "queued", activeSyncId: "22222222-2222-4222-8222-222222222222" } });
    mocks.launchStockSync.mockResolvedValue(202);
    mocks.searchPartners.mockResolvedValue({
      items: [
        {
          reference: {
            providerCode: "one-c",
            externalId: "PARTNER-1",
            externalType: "partner-company",
          },
          displayName: "Partner Company",
          legalName: "Partner Company Ltd.",
          taxId: "BG123456789",
          status: "active",
          managerReference: null,
          contracts: [
            {
              reference: {
                providerCode: "one-c",
                externalId: "CONTRACT-1",
                externalType: "partner-contract",
              },
              name: "Default contract",
              active: true,
              isDefault: true,
              priceTypeReference: {
                providerCode: "one-c",
                externalId: "PRICE-1",
                externalType: "price-type",
              },
              priceTypeName: "Wholesale",
            },
          ],
          priceTypes: [
            {
              reference: {
                providerCode: "one-c",
                externalId: "PRICE-1",
                externalType: "price-type",
              },
              name: "Wholesale",
              currency: "BGN",
              active: true,
              isDefault: true,
            },
          ],
          metadata: {
            sourceReference: {
              providerCode: "one-c",
              externalId: "PARTNER-1",
              externalType: "partner-company",
            },
            sourceUpdatedAt: null,
            importedAt: null,
          },
        },
      ],
      nextCursor: null,
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
    expect(mocks.startPriceSync).not.toHaveBeenCalled();
  });

  it("rejects partner users from price sync", async () => {
    mocks.ensureActiveUser.mockResolvedValue(makeProfile(UserType.External));

    await expect(syncPricesFromOneCAction()).resolves.toMatchObject({
      success: false,
      errorCode: "FORBIDDEN",
    });
    expect(mocks.startPriceSync).not.toHaveBeenCalled();
  });

  it("runs price sync for active internal admins", async () => {
    const result = await syncPricesFromOneCAction();

    expect(result).toMatchObject({
      success: true,
      data: {
        status: "queued",
      },
    });
    expect(mocks.startPriceSync).toHaveBeenCalledOnce();
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
      data: { status: "queued" },
    });
    expect(mocks.startStockSync).toHaveBeenCalledOnce();
  });

  it("returns a safe partner search error when unauthenticated", async () => {
    mocks.getAuthenticatedUserId.mockRejectedValue(new UnauthenticatedError());

    await expect(
      searchOneCPartnersAction({ query: "partner" }),
    ).resolves.toMatchObject({
      success: false,
      errorCode: "AUTH_REQUIRED",
    });
    expect(mocks.searchPartners).not.toHaveBeenCalled();
  });

  it("rejects partner users from 1C partner search", async () => {
    mocks.ensureActiveUser.mockResolvedValue(makeProfile(UserType.External));

    await expect(
      searchOneCPartnersAction({ query: "partner" }),
    ).resolves.toMatchObject({
      success: false,
      errorCode: "FORBIDDEN",
    });
    expect(mocks.searchPartners).not.toHaveBeenCalled();
  });

  it("allows configured development test manager to search 1C partners", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_TEST_MODE", "true");
    vi.stubEnv("DEV_TEST_MANAGER_EMAIL", "manager@example.com");
    mocks.ensureActiveUser.mockResolvedValue({
      ...makeProfile(UserType.External),
      email: "manager@example.com",
    });

    const result = await searchOneCPartnersAction({ query: "partner" });

    expect(result).toMatchObject({
      success: true,
      data: [{ external1cId: "PARTNER-1" }],
    });
    expect(mocks.searchPartners).toHaveBeenCalledOnce();
  });

  it("searches 1C partners for active internal admins", async () => {
    const result = await searchOneCPartnersAction({ query: " BG123456789 " });

    expect(result).toMatchObject({
      success: true,
      data: [
        {
          external1cId: "PARTNER-1",
        },
      ],
    });
    expect(mocks.searchPartners).toHaveBeenCalledWith({
      query: "BG123456789",
      limit: 10,
    });
  });

  it("validates short 1C partner search input before integration call", async () => {
    const result = await searchOneCPartnersAction({ query: "x" });

    expect(result).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
    expect(mocks.searchPartners).not.toHaveBeenCalled();
  });

  it("returns safe unavailable error for 1C partner search failures", async () => {
    mocks.searchPartners.mockRejectedValue(
      new IntegrationProviderUnavailableError("Bearer SECRET failed."),
    );

    const result = await searchOneCPartnersAction({ query: "partner" });

    expect(result).toMatchObject({
      success: false,
      errorCode: "ONEC_UNAVAILABLE",
      message: "1C is temporarily unavailable.",
    });
    expect(result.message).not.toContain("SECRET");
  });

  it("returns a safe timeout message without provider details", async () => {
    mocks.searchPartners.mockRejectedValue(
      new IntegrationTimeoutError("Request to internal-host:8080 timed out."),
    );

    const result = await searchOneCPartnersAction({ query: "partner" });

    expect(result).toMatchObject({
      success: false,
      errorCode: "ONEC_TIMEOUT",
      message: "Search request timed out.",
    });
    expect(result.message).not.toContain("internal-host");
  });

  it("returns safe invalid response error for malformed 1C partner search payloads", async () => {
    mocks.searchPartners.mockRejectedValue(
      new IntegrationValidationError("Raw invalid payload"),
    );

    const result = await searchOneCPartnersAction({ query: "partner" });

    expect(result).toMatchObject({
      success: false,
      errorCode: "ONEC_INVALID_RESPONSE",
      message: "Invalid server response from 1C.",
    });
    expect(result.message).not.toContain("Raw");
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

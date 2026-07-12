import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserStatus, UserType } from "../../../access-control/types";

const mocks = vi.hoisted(() => ({ getAuthenticatedUserId: vi.fn(async () => "admin"), createUserProfileService: vi.fn(), ensureActiveUser: vi.fn(), createDailyCatalogSyncService: vi.fn(), createDailyCatalogSyncStateReader: vi.fn(), runFullSync: vi.fn(), revalidatePath: vi.fn(), getOneCEnv: vi.fn(() => ({})) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../../../lib/env", () => ({ getOneCEnv: mocks.getOneCEnv }));
vi.mock("../../../access-control/actions/service-factory", () => ({ getAuthenticatedUserId: mocks.getAuthenticatedUserId, createUserProfileService: mocks.createUserProfileService }));
vi.mock("../../services", () => ({ createDailyCatalogSyncService: mocks.createDailyCatalogSyncService, createDailyCatalogSyncStateReader: mocks.createDailyCatalogSyncStateReader }));

import { runDailyCatalogSyncAction } from "../catalog-daily-sync.action";

describe("runDailyCatalogSyncAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createUserProfileService.mockReturnValue({ ensureActiveUser: mocks.ensureActiveUser });
    mocks.ensureActiveUser.mockResolvedValue({ id: "admin", userType: UserType.Internal, status: UserStatus.Active });
    mocks.createDailyCatalogSyncService.mockReturnValue({ runFullSync: mocks.runFullSync });
  });
  it("invokes only the daily full sync and revalidates after persisted success", async () => {
    mocks.runFullSync.mockResolvedValue({ state, skippedBecauseRunning: false });
    const result = await runDailyCatalogSyncAction();
    expect(result.success).toBe(true);
    expect(mocks.createDailyCatalogSyncService).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/integrations/catalog-sync");
  });
  it("does not return success for a persisted failed state", async () => {
    mocks.runFullSync.mockResolvedValue({ state: { ...state, status: "failed" }, skippedBecauseRunning: false });
    await expect(runDailyCatalogSyncAction()).resolves.toMatchObject({ success: false, errorCode: "CATALOG_SYNC_FAILED" });
  });
});
const state = { status: "succeeded", rootName: "SECURITYPARK DISTRIBUTION", lastSuccessfulSyncAt: null, durationMs: 1, pagesProcessed: 1, foldersReceived: 1, productsReceived: 1, foldersUpserted: 1, productsUpserted: 1, rowsDeactivated: 0, errorCategory: null, failedStage: null, nextScheduledRun: "2026-07-13T02:00:00.000Z" };

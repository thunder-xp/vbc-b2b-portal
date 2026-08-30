import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticatedUserId: vi.fn(),
  refresh: vi.fn(),
  revalidatePath: vi.fn(),
  syncOwnCompany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  refresh: mocks.refresh,
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("../../../access-control/actions/service-factory", () => ({
  createUserProfileService: vi.fn(),
  getAuthenticatedUserId: mocks.authenticatedUserId,
}));
vi.mock("../service-factory", () => ({
  createPartnerOrderHistoryService: () => ({
    syncOwnCompany: mocks.syncOwnCompany,
  }),
  createPartnerOrderService: vi.fn(),
}));

import { refreshPartnerOrderHistoryAction } from "../order.actions";

describe("partner order-history manual refresh action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticatedUserId.mockResolvedValue("user-1");
    mocks.syncOwnCompany.mockResolvedValue({ syncId: "sync-1" });
  });

  it("invalidates order history and refreshes current server state after a committed sync", async () => {
    const result = await refreshPartnerOrderHistoryAction();

    expect(result.success).toBe(true);
    expect(mocks.syncOwnCompany).toHaveBeenCalledWith("user-1", "incremental");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/cabinet/orders");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/cabinet/orders/[id]", "page");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("preserves the confirmed browser state when synchronization fails", async () => {
    mocks.syncOwnCompany.mockRejectedValue(new Error("1C unavailable"));

    const result = await refreshPartnerOrderHistoryAction();

    expect(result.success).toBe(false);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

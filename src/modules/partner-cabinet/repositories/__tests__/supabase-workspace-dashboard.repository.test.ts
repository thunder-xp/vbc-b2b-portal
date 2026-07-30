import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));

import {
  SupabaseWorkspaceDashboardRepository,
  WorkspaceDashboardRepositoryError,
} from "../supabase-workspace-dashboard.repository";

describe("SupabaseWorkspaceDashboardRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses one tenant-bound aggregate RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: validProjection(), error: null });

    await expect(
      new SupabaseWorkspaceDashboardRepository().getDashboard(
        "11111111-1111-4111-8111-111111111111",
      ),
    ).resolves.toMatchObject({ attentionItems: [], reorderProducts: [] });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "get_partner_workspace_dashboard_v2",
      { p_company_id: "11111111-1111-4111-8111-111111111111" },
    );
  });

  it("rejects malformed aggregate data at the repository boundary", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ...validProjection(), attentionItems: [{ id: "not-a-uuid" }] },
      error: null,
    });

    await expect(
      new SupabaseWorkspaceDashboardRepository().getDashboard(
        "11111111-1111-4111-8111-111111111111",
      ),
    ).rejects.toBeInstanceOf(WorkspaceDashboardRepositoryError);
  });
});

function validProjection() {
  return {
    attentionItems: [],
    orderSummary: {
      active: 0,
      confirmed: 0,
      attention: 0,
      portalProcessing: 0,
      recent: [],
    },
    shipmentSummary: {
      overdue: 0,
      today: 0,
      nextThreeDays: 0,
      later: 0,
      items: [],
    },
    continuationItems: [],
    reorderProducts: [],
    merchandisingProducts: [],
    financeSummary: null,
    companySummary: null,
    freshness: { ordersUpdatedAt: null, financeUpdatedAt: null },
  };
}

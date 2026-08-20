import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/src/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
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
      "get_partner_workspace_dashboard_v5",
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

  it("uses one server-only login-generation selection RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        snapshotHit: true,
        previousSourceFingerprint: "orders-v1",
        offerSourceFingerprint: "offers-v1",
        previousProducts: [],
        merchandisingProducts: [],
        previousCandidateCount: 0,
        offerCandidateCount: 0,
        rotationBucket: 1,
      },
      error: null,
    });

    await expect(new SupabaseWorkspaceDashboardRepository().getProductSelections(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "2026-08-01T10:00:00Z",
    )).resolves.toMatchObject({ snapshotHit: true });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("get_or_refresh_partner_dashboard_selections", {
      p_user_id: "11111111-1111-4111-8111-111111111111",
      p_company_id: "22222222-2222-4222-8222-222222222222",
      p_login_generation: "2026-08-01T10:00:00Z",
    });
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

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/supabase/server", () => ({ createClient: vi.fn() }));

import type { AdminDashboardRepository } from "../../repositories";
import { AdminDashboardService } from "../admin-dashboard.service";

function repository(): AdminDashboardRepository {
  return {
    getPlatformHealth: vi.fn().mockResolvedValue({
      catalog: {
        status: "succeeded",
        lastSuccessAt: "2026-07-26T08:00:00.000Z",
        updatedAt: "2026-07-26T08:00:00.000Z",
      },
      prices: {
        status: "failed",
        lastSuccessAt: "2026-07-25T08:00:00.000Z",
        updatedAt: "2026-07-26T08:00:00.000Z",
      },
      stock: {
        status: "running",
        lastSuccessAt: "2026-07-25T08:00:00.000Z",
        updatedAt: "2026-07-26T08:00:00.000Z",
      },
      arrivals: null,
      rates: {
        status: "succeeded",
        lastSuccessAt: "2026-07-01T08:00:00.000Z",
        updatedAt: "2026-07-01T08:00:00.000Z",
      },
    }),
    getOperationalSummary: vi.fn().mockResolvedValue({
      partnerAccess: {
        activeCompanies: 3,
        activePartnerUsers: 5,
        pendingInvitations: 1,
        suspendedMemberships: 0,
        companiesWithoutOwner: 1,
        companiesMissingMapping: 0,
      },
      queues: {
        pendingAccessRequests: 2,
        pendingDateChanges: 1,
        specificationsAwaitingReview: 4,
        failedOrderExports: 1,
      },
      finance: {
        eligibleCompanies: 3,
        successfulSnapshots: 2,
        staleSnapshots: 1,
        failedSyncs: 1,
        missingMappings: 0,
      },
    }),
    listRecentEvents: vi.fn().mockResolvedValue([
      {
        domain: "access",
        event_type: "invitation_created",
        occurred_at: "2026-07-26T09:00:00.000Z",
        subject: "Partner",
      },
    ]),
  };
}

describe("AdminDashboardService", () => {
  it("loads exactly three bounded projections in parallel", async () => {
    const repo = repository();
    const result = await new AdminDashboardService(repo).getDashboard(
      new Date("2026-07-26T10:00:00.000Z"),
    );

    expect(repo.getPlatformHealth).toHaveBeenCalledOnce();
    expect(repo.getOperationalSummary).toHaveBeenCalledOnce();
    expect(repo.listRecentEvents).toHaveBeenCalledWith(20);
    expect(result.freshness.map((item) => item.status)).toEqual([
      "healthy",
      "failed",
      "running",
      "never_run",
      "stale",
    ]);
    expect(result.criticalCount).toBe(3);
  });

  it("does not expose external health or raw commercial values", async () => {
    const result = await new AdminDashboardService(repository()).getDashboard(
      new Date("2026-07-26T10:00:00.000Z"),
    );
    expect(JSON.stringify(result)).not.toMatch(
      /authorization|credential|password|price_amount|raw_response/i,
    );
  });
});

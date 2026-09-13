import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/supabase/server", () => ({ createClient: vi.fn() }));

import type { AdminDashboardRepository } from "../../repositories";
import type { AdminOperationalIssue } from "../../types";
import { AdminDashboardService } from "../admin-dashboard.service";

const NOW = "2026-09-13T10:00:00.000Z";

function health(
  key: "catalog" | "prices" | "stock" | "arrivals" | "rates",
  status: "HEALTHY" | "FAILED" | "RUNNING" | "NEVER_SYNCED" | "STALE" | "SUCCESS_EMPTY",
) {
  return {
    key,
    status,
    lastAttemptAt: NOW,
    lastSuccessAt: status === "NEVER_SYNCED" ? null : "2026-09-12T08:00:00.000Z",
    lastSeenAt: NOW,
    operation: `${key}_sync`,
    stage: "publication",
    safeErrorCode: status === "FAILED" ? "SYNC_FAILED" : null,
    safeMessage: status === "FAILED" ? "Publication failed." : null,
    runId: status === "FAILED" ? "run-1" : null,
    correlationId: status === "FAILED" ? "run-1" : null,
    recoverability: "AUTOMATIC" as const,
    automaticRetryState: "SCHEDULED" as const,
    affectedScope: key,
    currentDataState: "Last good remains active.",
    received: 1,
    staged: 1,
    published: 1,
    durationMs: 10,
    sourceCalls: 1,
    retryCount: 0,
    technicalCode: null,
    historyHref: `/admin/integrations/jobs?domain=${key}`,
  };
}

function issue(domain: string): AdminOperationalIssue {
  return {
    id: `${domain}:run-1`,
    domain,
    severity: "HIGH",
    status: "ACTIVE",
    healthStatus: "FAILED",
    startedAt: NOW,
    lastSeenAt: NOW,
    lastSuccessAt: "2026-09-12T08:00:00.000Z",
    operation: `${domain}_sync`,
    stage: "publication",
    safeErrorCode: "SYNC_FAILED",
    safeMessage: "Publication failed.",
    runId: "run-1",
    correlationId: "run-1",
    recoverability: "MANUAL_AVAILABLE",
    automaticRetryState: "SCHEDULED",
    affectedScope: domain,
    currentDataState: "Last good remains active.",
    received: 1,
    staged: 1,
    published: 0,
    durationMs: 10,
    sourceCalls: 1,
    retryCount: 0,
    technicalCode: null,
    historyHref: `/admin/integrations/jobs?domain=${domain}`,
    detailHref: `/admin/operations/issues/${domain}:run-1`,
  };
}

function repository(): AdminDashboardRepository {
  return {
    getDashboardProjection: vi.fn().mockResolvedValue({
      health: [
        health("catalog", "HEALTHY"),
        health("prices", "FAILED"),
        health("stock", "RUNNING"),
        health("arrivals", "SUCCESS_EMPTY"),
        health("rates", "STALE"),
      ],
      operational: {
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
      },
      recentEvents: [
        {
          domain: "access",
          event_type: "invitation_created",
          occurred_at: NOW,
          subject: "Partner",
        },
      ],
      issues: [issue("prices"), issue("rates")],
      criticalCount: 2,
    }),
  };
}

describe("AdminDashboardService", () => {
  it("loads one bounded projection and preserves exact diagnostic links", async () => {
    const repo = repository();
    const result = await new AdminDashboardService(repo).getDashboard(new Date(NOW));

    expect(repo.getDashboardProjection).toHaveBeenCalledOnce();
    expect(repo.getDashboardProjection).toHaveBeenCalledWith(NOW);
    expect(result.freshness.map((item) => item.status)).toEqual([
      "HEALTHY",
      "FAILED",
      "RUNNING",
      "SUCCESS_EMPTY",
      "STALE",
    ]);
    expect(result.freshness.find((item) => item.key === "prices")?.href).toBe(
      "/admin/operations/issues/prices:run-1",
    );
    expect(result.freshness.find((item) => item.key === "catalog")?.href).toBe(
      "/admin/integrations/jobs?domain=catalog",
    );
    expect(result.criticalCount).toBe(2);
  });

  it("uses the active issue list cardinality rather than a stale aggregate", async () => {
    const repo = repository();
    const projection = await repo.getDashboardProjection(NOW);
    vi.mocked(repo.getDashboardProjection).mockResolvedValueOnce({
      ...projection,
      criticalCount: 99,
      issues: [issue("prices")],
    });
    const result = await new AdminDashboardService(repo).getDashboard(new Date(NOW));
    expect(result.criticalCount).toBe(1);
  });

  it("does not expose external health calls or raw commercial values", async () => {
    const result = await new AdminDashboardService(repository()).getDashboard(new Date(NOW));
    expect(JSON.stringify(result)).not.toMatch(/authorization|credential|password|price_amount|raw_response/i);
  });
});

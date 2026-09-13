import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/supabase/server", () => ({ createClient: vi.fn() }));

import type { AdminOperationsRepository } from "../../repositories";
import type { AdminOperationalIssue } from "../../types";
import { AdminOperationsService } from "../admin-operations.service";

const NOW = "2026-09-13T10:00:00.000Z";

function failedPriceIssue(overrides: Partial<AdminOperationalIssue> = {}): AdminOperationalIssue {
  return {
    id: "prices:11111111-1111-1111-1111-111111111111",
    domain: "prices",
    severity: "HIGH",
    status: "ACTIVE",
    healthStatus: "FAILED",
    startedAt: "2026-09-11T23:29:00.000Z",
    lastSeenAt: "2026-09-11T23:31:00.000Z",
    lastSuccessAt: "2026-09-11T18:42:00.000Z",
    operation: "price_sync",
    stage: "publication",
    safeErrorCode: "PRICE_PUBLICATION_TIMEOUT",
    safeMessage: "Публикация не завершилась за допустимое время.",
    runId: "11111111-1111-1111-1111-111111111111",
    correlationId: "11111111-1111-1111-1111-111111111111",
    recoverability: "MANUAL_AVAILABLE",
    automaticRetryState: "SCHEDULED",
    affectedScope: "partner_prices",
    currentDataState: "Последняя подтверждённая публикация остаётся активной.",
    received: 100,
    staged: 100,
    published: 0,
    durationMs: 120000,
    sourceCalls: 4,
    retryCount: 1,
    technicalCode: "57014",
    failedPage: 2,
    historyHref: "/admin/integrations/jobs?domain=prices",
    detailHref: "/admin/operations/issues/prices:11111111-1111-1111-1111-111111111111",
    ...overrides,
  };
}

function repository(issue: AdminOperationalIssue | null): AdminOperationsRepository {
  return {
    listOperationalIssues: vi.fn().mockResolvedValue(issue ? [issue] : []),
    getOperationalIssue: vi.fn().mockResolvedValue(issue),
  } as unknown as AdminOperationsRepository;
}

describe("AdminOperationsService operational diagnostics", () => {
  it("preserves exact run/correlation context and bounded metrics", async () => {
    const repo = repository(failedPriceIssue());
    const result = await new AdminOperationsService(repo).getOperationalIssue(
      "prices:11111111-1111-1111-1111-111111111111",
      new Date(NOW),
    );

    expect(repo.getOperationalIssue).toHaveBeenCalledWith(
      "prices:11111111-1111-1111-1111-111111111111",
      NOW,
    );
    expect(result).toMatchObject({
      domain: "prices",
      stage: "publication",
      runId: "11111111-1111-1111-1111-111111111111",
      correlationId: "11111111-1111-1111-1111-111111111111",
      lastSuccessAt: "2026-09-11T18:42:00.000Z",
      published: 0,
    });
  });

  it("removes a resolved issue because the current projection returns no row", async () => {
    const service = new AdminOperationsService(repository(null));
    expect(await service.listOperationalIssues(new Date(NOW))).toEqual([]);
    expect(await service.getOperationalIssue("prices:resolved", new Date(NOW))).toBeNull();
  });

  it("rejects invalid direct identities before repository access", async () => {
    const repo = repository(failedPriceIssue());
    const service = new AdminOperationsService(repo);
    expect(await service.getOperationalIssue("../../secrets", new Date(NOW))).toBeNull();
    expect(repo.getOperationalIssue).not.toHaveBeenCalled();
  });

  it("redacts unsafe messages, tokens and links", async () => {
    const service = new AdminOperationsService(repository(failedPriceIssue({
      safeMessage: "Authorization: Bearer secret-token",
      technicalCode: "password=hunter2",
      historyHref: "https://unsafe.example/log",
      detailHref: "//unsafe.example",
    })));
    const result = await service.getOperationalIssue(
      "prices:11111111-1111-1111-1111-111111111111",
      new Date(NOW),
    );
    expect(JSON.stringify(result)).not.toMatch(/secret-token|hunter2|unsafe\.example/);
    expect(result?.historyHref).toBe("/admin/integrations/jobs");
    expect(result?.detailHref).toBe("/admin/operations/issues");
  });
});

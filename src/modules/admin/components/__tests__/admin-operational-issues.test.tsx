import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AdminDashboard, AdminOperationalIssue } from "../../types";
import { AdminDashboardView } from "../AdminDashboardView";
import { AdminOperationalIssueDetail, AdminOperationalIssueList } from "../AdminOperationalIssues";

vi.mock("../../actions", () => ({ runAdminSyncAction: vi.fn() }));

const issue: AdminOperationalIssue = {
  id: "prices:run-42",
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
  runId: "run-42",
  correlationId: "run-42",
  recoverability: "MANUAL_AVAILABLE",
  automaticRetryState: "SCHEDULED",
  affectedScope: "partner_prices",
  currentDataState: "Последняя подтверждённая публикация остаётся активной.",
  received: 50,
  staged: 50,
  published: 0,
  durationMs: 1000,
  sourceCalls: 2,
  retryCount: 1,
  technicalCode: "57014",
  historyHref: "/admin/integrations/jobs?domain=prices",
  detailHref: "/admin/operations/issues/prices:run-42",
};

const dashboard: AdminDashboard = {
  freshness: [
    { key: "catalog", label: "Каталог", status: "HEALTHY", lastAttemptAt: null, lastSuccessAt: "2026-09-13T08:00:00.000Z", href: "/admin/integrations/jobs?domain=catalog" },
    { key: "prices", label: "Цены", status: "FAILED", lastAttemptAt: "2026-09-13T09:00:00.000Z", lastSuccessAt: "2026-09-12T08:00:00.000Z", href: issue.detailHref },
    { key: "stock", label: "Остатки", status: "STALE", lastAttemptAt: null, lastSuccessAt: "2026-09-01T08:00:00.000Z", href: "/admin/operations/issues/stock:stale" },
    { key: "arrivals", label: "Поступления", status: "NEVER_SYNCED", lastAttemptAt: null, lastSuccessAt: null, href: "/admin/operations/issues/arrivals:never" },
    { key: "rates", label: "Курсы", status: "SUCCESS_EMPTY", lastAttemptAt: null, lastSuccessAt: "2026-09-13T08:00:00.000Z", href: "/admin/integrations/jobs?domain=rates" },
  ],
  partnerAccess: { activeCompanies: 1, activePartnerUsers: 1, pendingInvitations: 0, suspendedMemberships: 0, companiesWithoutOwner: 0, companiesMissingMapping: 0 },
  queues: { pendingAccessRequests: 0, pendingDateChanges: 0, specificationsAwaitingReview: 0, failedOrderExports: 0 },
  finance: { eligibleCompanies: 1, successfulSnapshots: 1, staleSnapshots: 0, failedSyncs: 0, missingMappings: 0 },
  recentEvents: [],
  criticalCount: 3,
};

describe("Admin operational drilldown", () => {
  it("makes failed/stale/never-synced cards direct links and distinguishes success-empty", () => {
    render(<AdminDashboardView dashboard={dashboard} />);
    expect(screen.getByRole("link", { name: /Цены: Ошибка/ })).toHaveAttribute("href", issue.detailHref);
    expect(screen.getByRole("link", { name: /Остатки: Устарело/ })).toHaveAttribute("href", "/admin/operations/issues/stock:stale");
    expect(screen.getByRole("link", { name: /Поступления: Ещё не синхронизировано/ })).toBeInTheDocument();
    expect(screen.getByText("Нет данных в 1С")).toHaveClass("text-emerald-700");
    expect(screen.getByText("Состояние данных и последние события")).toBeInTheDocument();
  });

  it("lists exactly the supplied active issues", () => {
    render(<AdminOperationalIssueList issues={[issue]} />);
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Подробнее →" })).toHaveAttribute("href", issue.detailHref);
  });

  it("shows operator summary, safe IDs and no retry control without manage permission", () => {
    render(<AdminOperationalIssueDetail canManage={false} issue={issue} />);
    expect(screen.getByText("Публикация не завершилась за допустимое время.")).toBeInTheDocument();
    expect(screen.getAllByText("run-42")).toHaveLength(2);
    expect(screen.getByText("Последняя подтверждённая публикация остаётся активной.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Повторить" })).not.toBeInTheDocument();
    expect(screen.getByText(/только пользователям с правом управления/)).toBeInTheDocument();
  });

  it("shows governed retry only for integration managers", () => {
    render(<AdminOperationalIssueDetail canManage issue={issue} />);
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
  });
});

import "server-only";

import type { AdminOperationsRepository } from "../repositories";
import { SupabaseAdminOperationsRepository } from "../repositories";
import type {
  AdminCommercialSummary,
  AdminCommercialIntegrity,
  AdminGovernedPriceCoverage,
  AdminSducReadiness,
  AdminStockReconciliation,
  AdminRetailHistoryAbsenceFilters,
  AdminRetailHistoryAbsencePage,
  AdminRetailPriceHistoryHealth,
  AdminIntegrationCenter,
  AdminIntegrationIncident,
  AdminOperationalIssue,
  AdminOperationalPage,
  AdminSyncJobFilters,
  AdminSyncJobPage,
  AdminSupportPage,
} from "../types";

export class AdminOperationsService {
  constructor(private readonly repository: AdminOperationsRepository) {}

  getIntegrationCenter(): Promise<AdminIntegrationCenter> {
    return this.repository.getIntegrationCenter();
  }

  listSyncJobs(input: AdminSyncJobFilters): Promise<AdminSyncJobPage> {
    return this.repository.listSyncJobs({
      domain: cleanToken(input.domain),
      status: cleanToken(input.status),
      trigger: cleanToken(input.trigger),
      from: validDate(input.from),
      to: validDate(input.to),
      page: positiveInteger(input.page, 1),
      pageSize: Math.min(positiveInteger(input.pageSize, 25), 50),
    });
  }

  listIncidents(): Promise<readonly AdminIntegrationIncident[]> {
    return this.repository.listIncidents();
  }

  async listOperationalIssues(now = new Date()): Promise<readonly AdminOperationalIssue[]> {
    const issues = await this.repository.listOperationalIssues(now.toISOString());
    return issues.map(sanitizeOperationalIssue);
  }

  async getOperationalIssue(
    issueId: string,
    now = new Date(),
  ): Promise<AdminOperationalIssue | null> {
    const normalized = decodeIssueId(issueId);
    if (!/^[a-z0-9:_-]{1,160}$/.test(normalized)) return null;
    const issue = await this.repository.getOperationalIssue(normalized, now.toISOString());
    return issue ? sanitizeOperationalIssue(issue) : null;
  }

  getCommercialSummary(
    domain: "catalog" | "prices" | "stock" | "arrivals",
    search?: string,
  ): Promise<AdminCommercialSummary> {
    return this.repository.getCommercialSummary(domain, search?.slice(0, 100));
  }

  getCommercialIntegrity(): Promise<AdminCommercialIntegrity> {
    return this.repository.getCommercialIntegrity();
  }

  getGovernedPriceCoverage(): Promise<AdminGovernedPriceCoverage> {
    return this.repository.getGovernedPriceCoverage();
  }

  getSducReadiness(): Promise<AdminSducReadiness> {
    return this.repository.getSducReadiness();
  }

  getStockReconciliation(): Promise<AdminStockReconciliation> {
    return this.repository.getStockReconciliation();
  }

  getRetailPriceHistoryHealth(): Promise<AdminRetailPriceHistoryHealth> {
    return this.repository.getRetailPriceHistoryHealth();
  }

  listProductsWithoutRetailHistory(
    input: AdminRetailHistoryAbsenceFilters,
  ): Promise<AdminRetailHistoryAbsencePage> {
    return this.repository.listProductsWithoutRetailHistory({
      search: input.search?.trim().slice(0, 100) || undefined,
      categoryId: validUuid(input.categoryId),
      reason: cleanAbsenceReason(input.reason),
      page: positiveInteger(input.page, 1),
      pageSize: Math.min(positiveInteger(input.pageSize, 25), 50),
    });
  }

  getOperationalPage(
    view: "orders" | "shipments" | "reservations",
    page?: number,
  ): Promise<AdminOperationalPage> {
    return this.repository.getOperationalPage(view, positiveInteger(page, 1));
  }

  getSupportPage(
    view: "estimates" | "finance",
    page?: number,
  ): Promise<AdminSupportPage> {
    return this.repository.getSupportPage(view, positiveInteger(page, 1));
  }

  getGovernanceSummary(
    view: "security" | "settings",
  ): Promise<{ metrics: Readonly<Record<string, number>> }> {
    return this.repository.getGovernanceSummary(view);
  }
}

const operationsService = new AdminOperationsService(
  new SupabaseAdminOperationsRepository(),
);

export function createAdminOperationsService(): AdminOperationsService {
  return operationsService;
}

function cleanToken(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && /^[a-z_]+$/.test(normalized) ? normalized : undefined;
}

function validDate(value: string | undefined): string | undefined {
  return value && Number.isFinite(Date.parse(value)) ? value : undefined;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ABSENCE_REASONS = new Set([
  "no_retail_register_record",
  "baseline_only_new_product",
  "current_price_without_historical_source",
  "source_record_not_currently_authoritative",
  "unknown_requires_review",
]);

function validUuid(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && UUID.test(normalized) ? normalized : undefined;
}

function cleanAbsenceReason(
  value: AdminRetailHistoryAbsenceFilters["reason"],
): AdminRetailHistoryAbsenceFilters["reason"] {
  return value && ABSENCE_REASONS.has(value) ? value : undefined;
}

function decodeIssueId(value: string): string {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return "";
  }
}

const UNSAFE_DIAGNOSTIC = /authorization|bearer|password|secret|credential|api[-_ ]?key|https?:\/\//i;

function sanitizeOperationalIssue(issue: AdminOperationalIssue): AdminOperationalIssue {
  const safeCode = safeToken(issue.safeErrorCode);
  const safeMessage = operatorMessage(issue, safeCode);
  return {
    ...issue,
    id: safeIdentity(issue.id),
    domain: safeIdentity(issue.domain),
    operation: safeIdentity(issue.operation),
    stage: safeIdentity(issue.stage),
    safeErrorCode: safeCode,
    safeMessage,
    runId: safeToken(issue.runId),
    correlationId: safeToken(issue.correlationId),
    affectedScope: safeText(issue.affectedScope, "Затронутая область не определена."),
    currentDataState: safeText(issue.currentDataState, "Состояние последней публикации требует проверки."),
    technicalCode: safeToken(issue.technicalCode),
    historyHref: safeAdminHref(issue.historyHref, "/admin/integrations/jobs"),
    detailHref: safeAdminHref(issue.detailHref, "/admin/operations/issues"),
    received: safeCount(issue.received),
    staged: safeCount(issue.staged),
    published: safeCount(issue.published),
    sourceCalls: safeCount(issue.sourceCalls),
    retryCount: safeCount(issue.retryCount),
    durationMs: issue.durationMs === null ? null : safeCount(issue.durationMs),
    failedPage: issue.failedPage == null ? null : safeCount(issue.failedPage),
  };
}

function operatorMessage(issue: AdminOperationalIssue, safeCode: string | null): string {
  const sanitized = safeText(
    issue.safeMessage,
    "Техническая причина скрыта. Используйте Run ID для внутренней диагностики.",
  );
  if (
    issue.domain === "prices"
    && safeCode === "57014"
    && /statement timeout/i.test(sanitized)
  ) {
    return "Публикация цен не завершилась за допустимое время.";
  }
  return sanitized;
}

function safeText(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim().slice(0, 300);
  return normalized && !UNSAFE_DIAGNOSTIC.test(normalized) ? normalized : fallback;
}

function safeToken(value: string | null | undefined): string | null {
  const normalized = value?.trim().slice(0, 160);
  return normalized && /^[a-z0-9_.:-]+$/i.test(normalized) ? normalized : null;
}

function safeIdentity(value: string): string {
  return safeToken(value) ?? "unknown";
}

function safeAdminHref(value: string, fallback: string): string {
  return value.startsWith("/admin/") && !value.startsWith("//") ? value : fallback;
}

function safeCount(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
}

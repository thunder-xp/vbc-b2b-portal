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
  AdminSyncDomain,
  AdminSyncJobFilters,
  AdminSyncJobPage,
  AdminSupportPage,
} from "../types";

export interface AdminOperationsRepository {
  getIntegrationCenter(): Promise<AdminIntegrationCenter>;
  listSyncJobs(input: AdminSyncJobFilters): Promise<AdminSyncJobPage>;
  listIncidents(): Promise<readonly AdminIntegrationIncident[]>;
  listOperationalIssues(now: string): Promise<readonly AdminOperationalIssue[]>;
  getOperationalIssue(issueId: string, now: string): Promise<AdminOperationalIssue | null>;
  recordSyncAction(input: {
    domain: AdminSyncDomain;
    reason: string;
    resultStatus: "started" | "completed" | "locked" | "failed";
    runId: string | null;
    durationMs: number;
  }): Promise<string>;
  getCommercialSummary(
    domain: "catalog" | "prices" | "stock" | "arrivals",
    search?: string,
  ): Promise<AdminCommercialSummary>;
  getCommercialIntegrity(): Promise<AdminCommercialIntegrity>;
  getGovernedPriceCoverage(): Promise<AdminGovernedPriceCoverage>;
  getSducReadiness(): Promise<AdminSducReadiness>;
  getStockReconciliation(): Promise<AdminStockReconciliation>;
  getRetailPriceHistoryHealth(): Promise<AdminRetailPriceHistoryHealth>;
  listProductsWithoutRetailHistory(
    input: AdminRetailHistoryAbsenceFilters,
  ): Promise<AdminRetailHistoryAbsencePage>;
  getOperationalPage(
    view: "orders" | "shipments" | "reservations",
    page: number,
  ): Promise<AdminOperationalPage>;
  getSupportPage(
    view: "estimates" | "finance",
    page: number,
  ): Promise<AdminSupportPage>;
  getGovernanceSummary(
    view: "security" | "settings",
  ): Promise<{ metrics: Readonly<Record<string, number>> }>;
}

import type {
  AdminCommercialSummary,
  AdminCommercialIntegrity,
  AdminRetailHistoryAbsenceFilters,
  AdminRetailHistoryAbsencePage,
  AdminRetailPriceHistoryHealth,
  AdminIntegrationCenter,
  AdminIntegrationIncident,
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

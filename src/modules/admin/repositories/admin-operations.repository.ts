import type {
  AdminCommercialSummary,
  AdminIntegrationCenter,
  AdminIntegrationIncident,
  AdminSyncDomain,
  AdminSyncJobFilters,
  AdminSyncJobPage,
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
}

export type AdminSyncDomain =
  | "rates"
  | "catalog"
  | "prices"
  | "stock"
  | "commercial"
  | "active_orders"
  | "order_history"
  | "finance";

export interface AdminIntegrationState {
  domain: string;
  status: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  durationMs: number | null;
  received: number;
  published: number;
  excluded: number;
  safeErrorCode: string | null;
  runId: string | null;
}

export interface AdminIntegrationCenter {
  domains: readonly AdminIntegrationState[];
  locks: readonly {
    scope: string;
    runId: string;
    acquiredAt: string;
    expiresAt: string;
  }[];
}

export interface AdminSyncJob {
  run_id: string;
  domain: string;
  status: string;
  trigger_type: string;
  actor: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  received: number;
  published: number;
  excluded: number;
  safe_error_code: string | null;
}

export interface AdminSyncJobPage {
  items: readonly AdminSyncJob[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminIntegrationIncident {
  severity: "high" | "medium";
  domain: string;
  code: string;
  firstOccurrenceAt: string | null;
  latestOccurrenceAt: string | null;
  count: number;
  recommendedAction: string;
  href: string;
}

export interface AdminSyncJobFilters {
  domain?: string;
  status?: string;
  trigger?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

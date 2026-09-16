export type AdminSyncDomain =
  | "rates"
  | "catalog"
  | "prices"
  | "stock"
  | "commercial"
  | "active_orders"
  | "order_history"
  | "finance"
  | "product_relations";

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
  pricePublication?: {
    stagedRows: number;
    unchanged: number;
    inserted: number;
    updated: number;
    removed: number;
    batches: number;
    databaseDurationMs: number;
    timeoutBudgetMs: number;
    headroomPercent: number;
    warning: boolean;
    syncMode?: "incremental" | "full_reconciliation";
    triggerKind?: "scheduled" | "watchdog" | "manual";
    schedulerState?: "FRESH" | "STALE";
    lastSchedulerSeenAt?: string | null;
    expectedNextRunAt?: string | null;
    lastSourceSuccessAt?: string | null;
    lastPublicationSuccessAt?: string | null;
    sourceWatermark?: string | null;
    sourceQueryFrom?: string | null;
    sourceInspectedThrough?: string | null;
    retryCount?: number;
    domains?: readonly {
      scope: string;
      state: "FRESH" | "DEGRADED" | "STALE" | "FAILED";
      lastSourceSuccessAt: string | null;
      latestSourcePeriodSeen: string | null;
      lastPublicationSuccessAt: string | null;
      latestPublishedPeriod: string | null;
      sourceRowCount: number;
      publicationRunId: string | null;
    }[];
  };
  stockPublication?: {
    stockReceived: number;
    arrivalsReceived: number;
    sourceCalls: number;
    stockStagedRows: number;
    arrivalsStagedRows: number;
    stockDelta: { unchanged: number; inserted: number; updated: number; removed: number };
    arrivalsDelta: { unchanged: number; inserted: number; updated: number; removed: number };
    databaseDurationMs: number | null;
    applicationDurationMs: number | null;
    timeoutBudgetMs: number;
    headroomPercent: number | null;
    lockWaitMs: number | null;
    triggerRows: number;
    triggerDurationMs: number | null;
    sqlState: string | null;
    failedStage: string | null;
    recoveryState: string;
    affectedDomains: readonly string[];
    warning: boolean;
  };
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

export type AdminOperationalHealthStatus =
  | "HEALTHY"
  | "RUNNING"
  | "DEGRADED"
  | "FAILED"
  | "STALE"
  | "NEVER_SYNCED"
  | "SUCCESS_EMPTY";

export type AdminOperationalRecoverability =
  | "AUTOMATIC"
  | "MANUAL_AVAILABLE"
  | "MANUAL_REQUIRED";

export type AdminAutomaticRetryState =
  | "SCHEDULED"
  | "RUNNING"
  | "NOT_CONFIGURED"
  | "NOT_REQUIRED";

export interface AdminOperationalDiagnostic {
  key?: "catalog" | "prices" | "stock" | "arrivals" | "rates";
  id?: string;
  domain: string;
  severity?: "HIGH" | "MEDIUM";
  status?: "ACTIVE";
  healthStatus: AdminOperationalHealthStatus;
  startedAt: string | null;
  lastAttemptAt?: string | null;
  lastSeenAt: string | null;
  lastSuccessAt: string | null;
  operation: string;
  stage: string;
  safeErrorCode: string | null;
  safeMessage: string | null;
  runId: string | null;
  correlationId: string | null;
  recoverability: AdminOperationalRecoverability;
  automaticRetryState: AdminAutomaticRetryState;
  affectedScope: string;
  currentDataState: string;
  received: number;
  staged: number;
  published: number;
  durationMs: number | null;
  sourceCalls: number;
  retryCount: number;
  technicalCode: string | null;
  failedPage?: number | null;
  historyHref: string;
  detailHref?: string;
}

export interface AdminOperationalIssue extends AdminOperationalDiagnostic {
  id: string;
  severity: "HIGH" | "MEDIUM";
  status: "ACTIVE";
  detailHref: string;
}

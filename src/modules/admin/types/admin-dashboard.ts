export type AdminHealthStatus =
  | "HEALTHY"
  | "RUNNING"
  | "DEGRADED"
  | "FAILED"
  | "STALE"
  | "NEVER_SYNCED"
  | "SUCCESS_EMPTY";

export interface AdminFreshnessItem {
  key: "catalog" | "prices" | "stock" | "arrivals" | "rates";
  label: string;
  status: AdminHealthStatus;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  href: string;
}

export interface AdminPartnerAccessSummary {
  activeCompanies: number;
  activePartnerUsers: number;
  pendingInvitations: number;
  suspendedMemberships: number;
  companiesWithoutOwner: number;
  companiesMissingMapping: number;
}

export interface AdminQueueSummary {
  pendingAccessRequests: number;
  pendingDateChanges: number;
  specificationsAwaitingReview: number;
  failedOrderExports: number;
}

export interface AdminFinanceSummary {
  eligibleCompanies: number;
  successfulSnapshots: number;
  staleSnapshots: number;
  failedSyncs: number;
  missingMappings: number;
}

export interface AdminRecentEvent {
  domain: string;
  eventType: string;
  occurredAt: string;
  subject: string | null;
}

export interface AdminDashboard {
  freshness: readonly AdminFreshnessItem[];
  partnerAccess: AdminPartnerAccessSummary;
  queues: AdminQueueSummary;
  finance: AdminFinanceSummary;
  recentEvents: readonly AdminRecentEvent[];
  criticalCount: number;
}

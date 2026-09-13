type RawFreshness = {
  status: string;
  lastSuccessAt: string | null;
  updatedAt: string | null;
};

export interface AdminPlatformHealthProjection {
  catalog: RawFreshness | null;
  prices: RawFreshness | null;
  stock: RawFreshness | null;
  arrivals: RawFreshness | null;
  rates: RawFreshness | null;
}

export interface AdminOperationalProjection {
  partnerAccess: {
    activeCompanies: number;
    activePartnerUsers: number;
    pendingInvitations: number;
    suspendedMemberships: number;
    companiesWithoutOwner: number;
    companiesMissingMapping: number;
  };
  queues: {
    pendingAccessRequests: number;
    pendingDateChanges: number;
    specificationsAwaitingReview: number;
    failedOrderExports: number;
  };
  finance: {
    eligibleCompanies: number;
    successfulSnapshots: number;
    staleSnapshots: number;
    failedSyncs: number;
    missingMappings: number;
  };
}

export interface AdminRecentEventProjection {
  domain: string;
  event_type: string;
  occurred_at: string;
  subject: string | null;
}

export interface AdminCommercialHealthProjection {
  key: "catalog" | "prices" | "stock" | "arrivals" | "rates";
  status: AdminHealthStatus;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastSeenAt: string | null;
  operation: string;
  stage: string;
  safeErrorCode: string | null;
  safeMessage: string | null;
  runId: string | null;
  correlationId: string | null;
  recoverability: "AUTOMATIC" | "MANUAL_AVAILABLE" | "MANUAL_REQUIRED";
  automaticRetryState: "SCHEDULED" | "RUNNING" | "NOT_CONFIGURED" | "NOT_REQUIRED";
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
}

export interface AdminDashboardProjection {
  health: readonly AdminCommercialHealthProjection[];
  operational: AdminOperationalProjection;
  recentEvents: readonly AdminRecentEventProjection[];
  issues: readonly AdminOperationalIssue[];
  criticalCount: number;
}

export interface AdminDashboardRepository {
  getDashboardProjection(now: string): Promise<AdminDashboardProjection>;
}
import type {
  AdminHealthStatus,
  AdminOperationalIssue,
} from "../types";

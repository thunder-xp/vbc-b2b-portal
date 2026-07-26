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

export interface AdminDashboardRepository {
  getPlatformHealth(): Promise<AdminPlatformHealthProjection>;
  getOperationalSummary(): Promise<AdminOperationalProjection>;
  listRecentEvents(limit: number): Promise<readonly AdminRecentEventProjection[]>;
}

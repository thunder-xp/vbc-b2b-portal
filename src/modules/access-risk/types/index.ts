export const ACCESS_RISK_STATES = ["LEARNING", "LOW", "ELEVATED", "HIGH"] as const;
export type AccessRiskState = (typeof ACCESS_RISK_STATES)[number];
export type AccessRiskMonitoringMode = "NORMAL" | "ENHANCED";

export type AccessRiskReason = {
  code: string;
  observed: number;
  threshold: number;
};

export type AccessRiskOverviewItem = {
  id: string;
  displayName: string;
  riskState: AccessRiskState;
  riskScore: number;
  affectedUserCount: number;
  activeUserCount: number;
  reasonCodes: string[];
  devices24h: number;
  networks24h: number;
  uniqueSkus24h: number;
  commercialIntents24h: number;
  lastActivityAt: string | null;
  evaluatedAt: string | null;
  mode: AccessRiskMonitoringMode;
  enhancedUntil: string | null;
};

export type AccessRiskOverview = {
  kpis: { high: number; elevated: number; low: number; learning: number; enhanced: number; total: number };
  items: AccessRiskOverviewItem[];
  total: number;
  page: number;
  pageSize: number;
  diagnostics: AccessRiskDiagnostics | null;
};

export type AccessRiskDiagnostics = {
  completedAt: string;
  status: "COMPLETED" | "FAILED";
  companiesEvaluated: number;
  usersEvaluated: number;
  enhancedProfilesExpired: number;
  enhancedEventsDeleted: number;
  durationMs: number;
  isStale: boolean;
};

export type AccessRiskUserSnapshot = {
  id: string;
  name: string | null;
  email: string;
  riskState: AccessRiskState;
  riskScore: number;
  reasonCodes: string[];
  reasons: AccessRiskReason[];
  metrics: Record<string, number>;
  baselineDays: number;
  evaluatedAt: string;
};

export type AccessRiskTimelineItem = {
  id: string;
  occurredAt: string;
  eventName: string;
  routeFamily: string;
  userId: string;
  sessionHash: string;
  deviceHash: string;
  networkHash: string | null;
  countryCode: string | null;
  regionCode: string | null;
  productId: string | null;
  categoryId: string | null;
};

export type AccessRiskMonitoringEvent = {
  id: string;
  eventType: "ENHANCED_ACTIVATED" | "ENHANCED_STOPPED" | "ENHANCED_EXPIRED";
  previousMode: AccessRiskMonitoringMode;
  nextMode: AccessRiskMonitoringMode;
  reason: string | null;
  enhancedUntil: string | null;
  occurredAt: string;
};

export type AccessRiskCompanyDetail = {
  company: { id: string; name: string; status: string };
  snapshot: {
    riskState?: AccessRiskState;
    riskScore?: number;
    affectedUserCount?: number;
    activeUserCount?: number;
    reasonCodes?: string[];
    evaluatedAt?: string;
    lastActivityAt?: string | null;
  };
  monitoring: { mode: AccessRiskMonitoringMode; expiresAt: string | null; reason: string | null };
  users: AccessRiskUserSnapshot[];
  timeline: AccessRiskTimelineItem[];
  monitoringEvents: AccessRiskMonitoringEvent[];
  hasMoreTimeline: boolean;
};

export type AccessRiskTelemetryEvent = {
  eventName: string;
  routeFamily: string;
  occurredAt: string;
  productId?: string;
  categoryId?: string;
};

export type AccessRiskTelemetryBatch = {
  batchId: string;
  events: AccessRiskTelemetryEvent[];
};

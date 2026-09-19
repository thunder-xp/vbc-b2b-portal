import type { AgentComplianceStatus, AgentReferralStatus, CommercialAgentLevel, CommercialAgentStatus, CommercialAgentType } from "../agent-domain";

export type AgentCabinetAccessMode = "OPERATIONAL" | "RESTRICTED" | "STATUS_ONLY";

export type AgentCabinetContext = {
  id: string;
  agentCode: string;
  agentType: CommercialAgentType;
  displayName: string;
  legalName: string | null;
  phone: string | null;
  email: string | null;
  locality: string | null;
  profession: string | null;
  workplace: string | null;
  status: CommercialAgentStatus;
  complianceStatus: AgentComplianceStatus;
  level: CommercialAgentLevel;
  contractReady: boolean;
  accessMode: AgentCabinetAccessMode;
};

export type AgentReferralSummary = {
  id: string;
  name: string;
  submittedAt: string;
  updatedAt?: string;
  status: AgentReferralStatus;
  attributionId?: string | null;
  attributionStatus?: AgentClientView["status"] | null;
  protectionUntil?: string | null;
  lastEventType?: string | null;
  lastEventAt?: string | null;
};

export type AgentReferralView = AgentReferralSummary & {
  customerKind: "PERSON" | "LEGAL_ENTITY";
  phone: string | null;
  email: string | null;
  locality: string | null;
  objectType: string | null;
  needSummary: string;
  shortDescription: string | null;
  projectTiming: string | null;
  duplicateReason: string | null;
  existingCustomerReason: string | null;
  reviewedAt: string | null;
  events?: AgentOperationalEvent[];
};

export type AgentOperationalEvent = { id: string; type: string; createdAt: string };

export type AgentClientView = {
  id: string;
  name: string;
  customerKind: "PERSON" | "LEGAL_ENTITY";
  phone: string | null;
  email: string | null;
  locality: string | null;
  objectType: string | null;
  needSummary: string;
  referralId: string;
  status: "ACTIVE" | "EXPIRED" | "REASSIGNED" | "TERMINATED";
  attributedAt: string;
  protectionUntil: string;
  extendedUntil: string | null;
  lastEventType?: string | null;
  lastEventAt?: string | null;
  events?: AgentOperationalEvent[];
};

export type AgentCabinetOverview = {
  kpis: { myClients: number; activeReferrals: number; newReferrals: number; attributedToMe: number };
  needsAttention: AgentReferralSummary[];
  latestReferrals: AgentReferralSummary[];
  latestClients: Array<Pick<AgentClientView, "id" | "name" | "status" | "attributedAt" | "protectionUntil">>;
  latestActivity: Array<{
    id: string;
    eventType: string;
    createdAt: string;
    referralId: string | null;
    referralName: string | null;
  }>;
};

export type PageResult<T> = { items: T[]; total: number };
export type AgentPrimaryToken = { id: string; publicToken: string; createdAt: string };

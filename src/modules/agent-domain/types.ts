export type CommercialAgentType = "INDIVIDUAL" | "LEGAL_ENTITY";
export type CommercialAgentStatus =
  | "APPLIED"
  | "COMPLIANCE_REVIEW"
  | "CONTRACT_PENDING"
  | "APPROVED"
  | "TRAINING"
  | "ACTIVE"
  | "SUSPENDED"
  | "TERMINATED"
  | "REJECTED";
export type CommercialAgentLevel = "START" | "ACTIVE" | "PROFESSIONAL" | "STRATEGIC";
export type AgentComplianceStatus =
  | "UNREVIEWED"
  | "PENDING"
  | "APPROVED"
  | "REVIEW_REQUIRED"
  | "BLOCKED"
  | "REJECTED";

export type CommercialAgent = {
  id: string;
  userId: string | null;
  sourceAgent1cId: string | null;
  agentCode: string;
  agentType: CommercialAgentType;
  displayName: string;
  legalName: string | null;
  idnoIdnp: string | null;
  phone: string | null;
  email: string | null;
  locality: string | null;
  profession: string | null;
  workplace: string | null;
  status: CommercialAgentStatus;
  complianceStatus: AgentComplianceStatus;
  level: CommercialAgentLevel;
  contractReady: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AgentCompliance = {
  agentId: string;
  publicSectorFlag: boolean | null;
  externalPaidActivityStatus: "UNKNOWN" | "ALLOWED" | "REQUIRES_REVIEW" | "PROHIBITED";
  procurementParticipationFlag: boolean | null;
  conflictOfInterestStatus: "UNREVIEWED" | "NONE_DECLARED" | "REVIEW_REQUIRED" | "CONFIRMED";
  complianceReviewStatus: AgentComplianceStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  safeReviewNote: string | null;
};

export type AgentReferralToken = {
  id: string;
  agentId: string;
  tokenType: "QR" | "LINK";
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  campaignRef: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
};

export type AgentReferralStatus =
  | "CAPTURED"
  | "PENDING_REVIEW"
  | "VERIFIED"
  | "ACTIVE"
  | "DUPLICATE"
  | "EXISTING_CUSTOMER"
  | "CONFLICT"
  | "REJECTED"
  | "EXPIRED"
  | "REASSIGNED"
  | "TERMINATED";

export type AgentReferral = {
  id: string;
  agentId: string;
  agentCode?: string;
  agentDisplayName?: string;
  customerIdentityId: string | null;
  submittedAt: string;
  customerKind: "PERSON" | "LEGAL_ENTITY";
  name: string;
  phone: string | null;
  email: string | null;
  locality: string | null;
  objectType: string | null;
  needSummary: string;
  shortDescription: string | null;
  projectTiming: string | null;
  status: AgentReferralStatus;
  identityResolutionStatus: "MATCHED" | "NEW" | "AMBIGUOUS" | "CONFLICT";
  identityResolutionReason: string;
  duplicateReason: string | null;
  existingCustomerReason: string | null;
  reviewedAt: string | null;
};

export type AgentAttribution = {
  id: string;
  customerIdentityId: string;
  agentId: string;
  referralId: string;
  validFrom: string;
  validUntil: string | null;
  status: "ACTIVE" | "EXPIRED" | "REASSIGNED" | "TERMINATED";
  protectionUntil: string;
  extendedUntil: string | null;
  supersedesAttributionId: string | null;
};

export type AgentDetail = {
  agent: CommercialAgent;
  compliance: AgentCompliance | null;
  tokens: AgentReferralToken[];
  attributions: AgentAttribution[];
};

export type ExistingCustomerEvidence = {
  activeNegotiationCount: number;
  retailOrderCount: number;
  hasActiveRelationship: boolean;
  reasons: readonly ("ACTIVE_NEGOTIATION" | "RETAIL_ORDER")[];
};

export type CommissionPolicyContract = {
  level: CommercialAgentLevel;
  equipmentPercent: 4 | 5 | null;
  installationPercent: 8 | 10 | null;
  firstServicePaymentPercent: 10 | null;
  requiresGovernedOverride: boolean;
};

export type CommissionProjection = {
  attributionId: string;
  sourceSaleRef: string;
  sourcePaymentRef: string | null;
  policyVersion: string;
  status: "FORECAST" | "PENDING_1C_RECOGNITION" | "RECOGNIZED" | "REVERSED" | "PAID";
  oneCRecognitionRef: string | null;
};

export const AGENT_DOMAIN_EVENT_TYPES = [
  "AGENT_APPROVED",
  "REFERRAL_VERIFIED",
  "REFERRAL_REJECTED",
  "ATTRIBUTION_CONFIRMED",
  "ATTRIBUTION_CONFLICT",
] as const;

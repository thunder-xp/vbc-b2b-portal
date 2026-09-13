import type {
  AgentAttribution,
  AgentCompliance,
  AgentDetail,
  AgentReferral,
  AgentReferralStatus,
  CommercialAgent,
  CommercialAgentStatus,
  ExistingCustomerEvidence,
} from "./types";

export interface AgentDomainRepository {
  listAgents(): Promise<CommercialAgent[]>;
  getAgent(agentId: string): Promise<AgentDetail | null>;
  findAgentByUser(userId: string): Promise<CommercialAgent | null>;
  createAgent(input: {
    actorUserId: string;
    userId?: string | null;
    agentType: "INDIVIDUAL" | "LEGAL_ENTITY";
    displayName: string;
    legalName?: string | null;
    idnoIdnp?: string | null;
    phone?: string | null;
    email?: string | null;
    locality?: string | null;
    profession?: string | null;
    workplace?: string | null;
  }): Promise<CommercialAgent>;
  transitionAgent(agentId: string, targetStatus: CommercialAgentStatus, actorUserId: string): Promise<CommercialAgent>;
  reviewCompliance(input: {
    agentId: string;
    actorUserId: string;
    publicSectorFlag: boolean | null;
    externalPaidActivityStatus: AgentCompliance["externalPaidActivityStatus"];
    procurementParticipationFlag: boolean | null;
    conflictOfInterestStatus: AgentCompliance["conflictOfInterestStatus"];
    reviewStatus: AgentCompliance["complianceReviewStatus"];
    safeReviewNote?: string | null;
  }): Promise<void>;
  createToken(input: {
    agentId: string;
    tokenHash: string;
    tokenType: "QR" | "LINK";
    campaignRef?: string | null;
    expiresAt?: string | null;
    actorUserId: string;
  }): Promise<string>;
  revokeToken(tokenId: string, actorUserId: string): Promise<void>;
  findValidToken(tokenHash: string): Promise<{ agentId: string } | null>;
  createReferral(input: {
    tokenHash: string;
    customerIdentityId: string | null;
    customerKind: "PERSON" | "LEGAL_ENTITY";
    name: string;
    phone: string | null;
    email: string | null;
    locality: string | null;
    objectType: string | null;
    needSummary: string;
    shortDescription: string | null;
    projectTiming: string | null;
    resolutionStatus: "MATCHED" | "NEW" | "AMBIGUOUS" | "CONFLICT";
    resolutionReason: string;
    consentTextVersion: string;
    consentGivenAt: string;
  }): Promise<string>;
  listReferrals(): Promise<AgentReferral[]>;
  getReferral(referralId: string): Promise<AgentReferral | null>;
  transitionReferral(input: {
    referralId: string;
    targetStatus: AgentReferralStatus;
    actorUserId: string;
    customerIdentityId?: string | null;
    duplicateReason?: string | null;
    existingCustomerReason?: string | null;
  }): Promise<AgentReferral>;
  findActiveAttribution(customerIdentityId: string): Promise<AgentAttribution | null>;
  createAttribution(referralId: string, actorUserId: string): Promise<AgentAttribution>;
  detectExistingCustomerRelationship(customerIdentityId: string): Promise<ExistingCustomerEvidence>;
}

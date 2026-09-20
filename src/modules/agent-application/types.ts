import type { CommercialAgent } from "@/src/modules/agent-domain";

export type CommercialAgentApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "NEEDS_CLARIFICATION"
  | "APPROVED"
  | "REJECTED"
  | "WITHDRAWN";

export type CommercialAgentApplication = {
  id: string;
  applicantUserId: string;
  status: CommercialAgentApplicationStatus;
  displayName: string | null;
  phone: string | null;
  email: string | null;
  locality: string | null;
  profession: string | null;
  workplace: string | null;
  agentType: "INDIVIDUAL" | "LEGAL_ENTITY";
  legalName: string | null;
  applicantVisibleNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  provisionedAgentId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type CommercialAgentApplicationWorkspace = {
  application: CommercialAgentApplication | null;
  existingAgent: CommercialAgent | null;
};

export type CommercialAgentApplicationInput = {
  displayName: string;
  phone?: string | null;
  email?: string | null;
  locality?: string | null;
  profession?: string | null;
  workplace?: string | null;
  agentType: "INDIVIDUAL" | "LEGAL_ENTITY";
  legalName?: string | null;
};

export type CommercialAgentApplicationReviewAction = "REQUEST_CLARIFICATION" | "APPROVE" | "REJECT";

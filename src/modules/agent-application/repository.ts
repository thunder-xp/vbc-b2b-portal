import type {
  CommercialAgentApplication,
  CommercialAgentApplicationInput,
  CommercialAgentApplicationReviewAction,
} from "./types";

export interface CommercialAgentApplicationRepository {
  findByApplicant(applicantUserId: string): Promise<CommercialAgentApplication | null>;
  ensureDraft(input: {
    applicantUserId: string;
    email: string;
    registrationLegalForm: "INDIVIDUAL" | "LEGAL_ENTITY" | null;
    preferredLocale: "ru" | "ro" | null;
  }): Promise<CommercialAgentApplication | null>;
  submit(applicantUserId: string, input: CommercialAgentApplicationInput): Promise<CommercialAgentApplication>;
  withdraw(applicantUserId: string): Promise<CommercialAgentApplication>;
  listForAdmin(input?: CommercialAgentApplicationListInput): Promise<CommercialAgentApplication[]>;
  countReviewQueue(): Promise<number>;
  getForAdmin(applicationId: string): Promise<CommercialAgentApplication | null>;
  review(input: {
    applicationId: string;
    actorUserId: string;
    action: CommercialAgentApplicationReviewAction;
    safeNote?: string | null;
  }): Promise<CommercialAgentApplication>;
}

export type CommercialAgentApplicationListInput = {
  statuses?: readonly CommercialAgentApplication["status"][];
  limit?: number;
};

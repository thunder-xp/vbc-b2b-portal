import type {
  CommercialAgentApplication,
  CommercialAgentApplicationInput,
  CommercialAgentApplicationReviewAction,
} from "./types";

export interface CommercialAgentApplicationRepository {
  findByApplicant(applicantUserId: string): Promise<CommercialAgentApplication | null>;
  ensureDraft(applicantUserId: string, email: string): Promise<CommercialAgentApplication | null>;
  submit(applicantUserId: string, input: CommercialAgentApplicationInput): Promise<CommercialAgentApplication>;
  withdraw(applicantUserId: string): Promise<CommercialAgentApplication>;
  listForAdmin(): Promise<CommercialAgentApplication[]>;
  getForAdmin(applicationId: string): Promise<CommercialAgentApplication | null>;
  review(input: {
    applicationId: string;
    actorUserId: string;
    action: CommercialAgentApplicationReviewAction;
    safeNote?: string | null;
  }): Promise<CommercialAgentApplication>;
}

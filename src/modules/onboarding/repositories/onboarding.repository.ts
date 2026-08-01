import type {
  OnboardingDetailRecord,
  OnboardingApprovalResult,
  OnboardingHealth,
  OnboardingQueue,
  OnboardingStatus,
  PartnerOnboardingStatusCenter,
  PartnerCorrectionField,
} from "../types";

export type OnboardingQueueInput = {
  page: number;
  pageSize: number;
  status: string | null;
  assignedManager: string | null;
  unassigned: boolean;
  sla: string | null;
  matchState: string | null;
  search: string | null;
  locality: string | null;
  businessType: string | null;
  submittedFrom: string | null;
  submittedTo: string | null;
};

export interface OnboardingRepository {
  listQueue(input: OnboardingQueueInput): Promise<OnboardingQueue>;
  getDetail(requestId: string): Promise<OnboardingDetailRecord | null>;
  getHealth(): Promise<OnboardingHealth>;
  assign(requestId: string, assigneeUserId: string): Promise<void>;
  unassign(requestId: string): Promise<void>;
  transition(
    requestId: string,
    nextStatus: OnboardingStatus,
    reason: string | null,
  ): Promise<void>;
  confirmMatch(
    requestId: string,
    counterpartyId: string,
    initialAccessProfile: string,
  ): Promise<void>;
  saveApprovalDraft(input: SaveOnboardingApprovalDraftInput): Promise<void>;
  setApprovalDraftStep(
    requestId: string,
    expectedDraftVersion: number,
    step: number,
  ): Promise<void>;
  resetApprovalDraft(requestId: string): Promise<void>;
  approve(input: ApproveOnboardingInput): Promise<OnboardingApprovalResult>;
  requestClarification(input: ClarificationInput): Promise<void>;
  reject(input: RejectionInput): Promise<void>;
  cancelOwn(): Promise<void>;
  cancelInternal(requestId: string, reason: string, note: string): Promise<void>;
  reopen(requestId: string, assigneeUserId: string, reason: string): Promise<void>;
  submitPartnerRevision(input: PartnerRevisionInput): Promise<number>;
  getOwnStatusCenter(): Promise<PartnerOnboardingStatusCenter | null>;
  recordDirectoryRefreshEvent(input: DirectoryRefreshEventInput): Promise<void>;
  markWaitingForOneCCounterparty(input: MarkWaitingForOneCInput): Promise<void>;
}

export type DirectoryRefreshEventInput = {
  requestId: string;
  eventType:
    | "directory_refresh_requested"
    | "directory_refresh_succeeded"
    | "directory_refresh_failed";
  correlationId: string;
  safeErrorCode?: string | null;
};

export type MarkWaitingForOneCInput = {
  requestId: string;
  assigneeUserId: string | null;
  internalNote: string | null;
  correlationId: string;
};

export type ClarificationInput = {
  requestId: string;
  expectedRevision: number;
  reasonCategory: string;
  partnerMessage: string;
  fields: PartnerCorrectionField[];
  responseDeadline: string | null;
  internalNote: string | null;
};

export type RejectionInput = {
  requestId: string;
  expectedRevision: number;
  reasonCategory: string;
  partnerMessage: string;
  internalNote: string | null;
};

export type PartnerRevisionInput = {
  expectedRevision: number;
  companyName: string;
  fiscalCode: string;
  contactName: string;
  phone: string;
  email: string;
  locality: string;
  businessType: string;
  businessActivity: string;
  estimatedPurchasingVolume: string;
  comment: string;
};

export type SaveOnboardingApprovalDraftInput = {
  requestId: string;
  expectedRequestRevision: number;
  expectedDraftVersion: number;
  step: 1 | 2 | 3;
  counterpartyId?: string | null;
  assignedManagerId?: string | null;
  priceProfileId?: string | null;
  paymentModel?: string | null;
  initialProfile?: string | null;
  financeAccess?: boolean;
  orderAccess?: boolean;
};

export type ApproveOnboardingInput = {
  requestId: string;
  expectedRequestRevision: number;
  expectedDraftVersion: number;
  attemptKey: string;
  correlationId: string;
};

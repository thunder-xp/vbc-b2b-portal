import type {
  OnboardingDetail,
  OnboardingApprovalResult,
  OnboardingHealth,
  OnboardingQueue,
  OnboardingStatus,
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
  getDetail(requestId: string): Promise<OnboardingDetail | null>;
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
}

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

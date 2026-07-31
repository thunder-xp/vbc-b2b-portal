export enum AccessRequestStatus {
  PendingReview = "pending_review",
  Approved = "approved",
  Rejected = "rejected",
  Cancelled = "cancelled",
}

export interface AccessRequest {
  id: string;
  userId: string;
  companyId: string | null;
  requestedExternal1cId: string | null;
  requestedCompanyName: string | null;
  requestedFiscalCode: string | null;
  contactPhone: string | null;
  message: string | null;
  status: AccessRequestStatus;
  onboardingStatus?:
    | "received"
    | "under_review"
    | "clarification_requested"
    | "awaiting_1c_company"
    | "link_confirmation_required"
    | "ready_for_approval"
    | "approved"
    | "rejected"
    | "cancelled";
  reviewedBy: string | null;
  reviewedAt: string | null;
  decisionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

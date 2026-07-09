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
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

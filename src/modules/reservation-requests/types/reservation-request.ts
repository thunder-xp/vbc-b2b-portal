export enum ReservationRequestStatus {
  Draft = "draft",
  Submitted = "submitted",
  UnderReview = "under_review",
  Approved = "approved",
  PartiallyApproved = "partially_approved",
  Rejected = "rejected",
  Cancelled = "cancelled",
}

export interface ReservationRequest {
  id: string;
  companyId: string;
  specificationId: string;
  specificationRevisionId: string;
  createdBy: string;
  status: ReservationRequestStatus;
  requestedDeliveryDate: string | null;
  partnerComment: string | null;
  managerComment: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReservationRequestItem {
  id: string;
  reservationRequestId: string;
  productId: string;
  productNameSnapshot: string;
  skuSnapshot: string;
  slugSnapshot: string;
  specificationQuantity: number;
  requestedQuantity: number;
  approvedQuantity: number | null;
  partnerUnitPriceAmount: number | null;
  partnerCurrencyCode: string | null;
  retailUnitPriceAmount: number | null;
  retailCurrencyCode: string | null;
  createdAt: string;
  updatedAt: string;
}

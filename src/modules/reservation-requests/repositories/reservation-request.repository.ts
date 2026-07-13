import type { ReservationRequest, ReservationRequestItem, ReservationRequestStatus } from "../types";

export type InternalReservationRequestRecord = {
  request: ReservationRequest;
  companyName: string;
  projectName: string;
  customerSiteName: string;
};

export interface ReservationRequestRepository {
  listByCompanyId(companyId: string): Promise<ReservationRequest[]>;
  listForInternalReview(): Promise<InternalReservationRequestRecord[]>;
  findById(requestId: string): Promise<ReservationRequest | null>;
  findActiveBySpecificationRevisionId(specificationRevisionId: string): Promise<ReservationRequest | null>;
  listItems(requestId: string): Promise<ReservationRequestItem[]>;
  createFromApprovedSpecification(input: { specificationId: string; requestedDeliveryDate: string; partnerComment: string | null }): Promise<ReservationRequest>;
  updateDraft(input: { requestId: string; requestedDeliveryDate: string | null; partnerComment: string | null }): Promise<ReservationRequest>;
  updateRequestedQuantity(input: { itemId: string; requestedQuantity: number }): Promise<ReservationRequestItem>;
  submit(requestId: string): Promise<ReservationRequest>;
  canReviewInternally(): Promise<boolean>;
  startReview(requestId: string): Promise<ReservationRequest>;
  decide(input: {
    requestId: string;
    status: ReservationRequestStatus.Approved | ReservationRequestStatus.PartiallyApproved | ReservationRequestStatus.Rejected;
    approvedQuantities: Array<{ itemId: string; approvedQuantity: number }>;
    comment: string | null;
  }): Promise<ReservationRequest>;
}

export class ReservationRequestRepositoryError extends Error {
  constructor() {
    super("Reservation request persistence failed.");
    this.name = "ReservationRequestRepositoryError";
  }
}

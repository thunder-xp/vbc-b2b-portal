import type { AccessRequest, CompanyMembership, PartnerCompany, UserProfile } from "../types";

export interface AccessRequestReview {
  request: AccessRequest;
  requester: UserProfile | null;
}

export interface ApproveAccessRequestInput {
  actorUserId: string;
  requestId: string;
  external1cId: string;
  external1cCode?: string;
  external1cContractId: string;
  external1cPriceTypeId: string;
  decisionReason?: string | null;
}

export interface RejectAccessRequestInput {
  actorUserId: string;
  requestId: string;
  reason: string;
}

export interface ApprovedAccessRequestResult {
  request: AccessRequest;
  company: PartnerCompany;
  membership: CompanyMembership;
  requester: UserProfile;
}

export interface AccessApprovalService {
  listPendingReviewRequests(actorUserId: string): Promise<AccessRequestReview[]>;
  getRequestForReview(
    actorUserId: string,
    requestId: string,
  ): Promise<AccessRequestReview>;
  approveAccessRequest(
    input: ApproveAccessRequestInput,
  ): Promise<ApprovedAccessRequestResult>;
  rejectAccessRequest(input: RejectAccessRequestInput): Promise<AccessRequest>;
}

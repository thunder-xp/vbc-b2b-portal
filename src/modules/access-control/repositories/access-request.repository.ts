import type { AccessRequest, AccessRequestStatus } from "../types";

export interface FindPendingAccessRequestDuplicateInput {
  userId: string;
  requestedExternal1cId?: string | null;
  requestedCompanyName?: string | null;
  requestedFiscalCode?: string | null;
}

export interface CreateAccessRequestInput {
  userId: string;
  requestedExternal1cId?: string | null;
  requestedCompanyName?: string | null;
  requestedFiscalCode?: string | null;
  contactPhone?: string | null;
  message?: string | null;
}

export interface UpdateAccessRequestStatusInput {
  id: string;
  status: AccessRequestStatus;
  companyId?: string | null;
  requestedExternal1cId?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  decisionReason?: string | null;
}

export interface AccessRequestRepository {
  findById(id: string): Promise<AccessRequest | null>;
  findByUserId(userId: string): Promise<AccessRequest[]>;
  findPendingReview(): Promise<AccessRequest[]>;
  findPendingDuplicate(
    input: FindPendingAccessRequestDuplicateInput,
  ): Promise<AccessRequest | null>;
  create(input: CreateAccessRequestInput): Promise<AccessRequest>;
  updateStatus(input: UpdateAccessRequestStatusInput): Promise<AccessRequest>;
}

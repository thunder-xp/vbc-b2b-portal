import type { AccessRequest, AccessRequestStatus } from "../types";

export interface FindPendingAccessRequestDuplicateInput {
  userId: string;
  companyId?: string | null;
  requestedExternal1cId?: string | null;
  requestedCompanyName?: string | null;
  requestedFiscalCode?: string | null;
}

export interface CreateAccessRequestInput {
  userId: string;
  companyId?: string | null;
  requestedExternal1cId?: string | null;
  requestedCompanyName?: string | null;
  requestedFiscalCode?: string | null;
  contactPhone?: string | null;
  message?: string | null;
}

export interface UpdateAccessRequestStatusInput {
  id: string;
  status: AccessRequestStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
}

export interface AccessRequestRepository {
  findById(id: string): Promise<AccessRequest | null>;
  findByUserId(userId: string): Promise<AccessRequest[]>;
  findPendingDuplicate(
    input: FindPendingAccessRequestDuplicateInput,
  ): Promise<AccessRequest | null>;
  create(input: CreateAccessRequestInput): Promise<AccessRequest>;
  updateStatus(input: UpdateAccessRequestStatusInput): Promise<AccessRequest>;
}

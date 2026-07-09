import type { AccessRequest } from "../types";

export interface SubmitAccessRequestInput {
  userId: string;
  companyId?: string | null;
  requestedCompanyName?: string | null;
  requestedFiscalCode?: string | null;
  contactPhone?: string | null;
  message?: string | null;
}

export interface CancelOwnPendingAccessRequestInput {
  userId: string;
  requestId: string;
}

export interface AccessRequestService {
  submitAccessRequest(
    input: SubmitAccessRequestInput,
  ): Promise<AccessRequest>;
  getOwnAccessRequests(userId: string): Promise<AccessRequest[]>;
  cancelOwnPendingRequest(
    userId: string,
    requestId: string,
  ): Promise<AccessRequest>;
}

import type { AccessRequest } from "../types";

export interface SubmitAccessRequestInput {
  userId: string;
  companyId?: string | null;
  requestedExternal1cId?: string | null;
  requestedCompanyName?: string | null;
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

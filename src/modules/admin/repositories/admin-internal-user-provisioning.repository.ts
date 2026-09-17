export type BeginFinanceOperatorProvisioningResult = {
  requestId: string;
  newlyCreated: boolean;
};

export type InternalUserProvisioningState = {
  requestId: string;
  email: string;
  displayName: string;
  roleCode: string;
  status: "invited" | "active";
};

export type FinanceOperatorReissueCandidate = {
  requestId: string;
  email: string;
  authUserId: string;
  emailConfirmed: boolean;
  status: "invited" | "active";
};

export interface AdminInternalUserProvisioningRepository {
  begin(email: string, displayName: string, reason: string): Promise<BeginFinanceOperatorProvisioningResult>;
  getReissueCandidate(email: string): Promise<FinanceOperatorReissueCandidate | null>;
  markInvited(requestId: string, authUserId: string): Promise<void>;
  markReissued(requestId: string): Promise<void>;
  markFailed(requestId: string, safeErrorCode: string): Promise<void>;
  activateCurrent(): Promise<string>;
  getCurrent(): Promise<InternalUserProvisioningState | null>;
}

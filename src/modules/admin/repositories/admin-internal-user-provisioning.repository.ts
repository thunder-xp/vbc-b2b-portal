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

export interface AdminInternalUserProvisioningRepository {
  begin(email: string, displayName: string, reason: string): Promise<BeginFinanceOperatorProvisioningResult>;
  markInvited(requestId: string, authUserId: string): Promise<void>;
  markFailed(requestId: string, safeErrorCode: string): Promise<void>;
  activateCurrent(): Promise<string>;
  getCurrent(): Promise<InternalUserProvisioningState | null>;
}

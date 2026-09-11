export type AdminPartnerAuthIdentity = {
  id: string;
  email: string | null;
  hasEmailIdentity: boolean;
  isAnonymous: boolean;
};

export type AdminPartnerPasswordAuditInput = {
  actorUserId: string;
  targetUserId: string;
  targetCompanyId: string;
  correlationId: string;
};

export type AdminPartnerPasswordProviderFailureCode =
  | "AUTH_LOOKUP_FAILED"
  | "AUTH_UPDATE_FAILED"
  | "AUDIT_WRITE_FAILED";

export class AdminPartnerPasswordProviderFailure extends Error {
  constructor(readonly code: AdminPartnerPasswordProviderFailureCode) {
    super(code);
    this.name = "AdminPartnerPasswordProviderFailure";
  }
}

export interface AdminPartnerPasswordRepository {
  getAuthIdentity(authUserId: string): Promise<AdminPartnerAuthIdentity | null>;
  changePasswordAndRevokeTargetSessions(authUserId: string, newPassword: string): Promise<void>;
  recordPasswordChangeAudit(input: AdminPartnerPasswordAuditInput): Promise<string>;
}

export enum MembershipStatus {
  PendingApproval = "pending_approval",
  Active = "active",
  Suspended = "suspended",
  Revoked = "revoked",
  Rejected = "rejected",
}

export interface CompanyMembership {
  id: string;
  userId: string;
  companyId: string;
  roleId: string;
  status: MembershipStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  revokedBy: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

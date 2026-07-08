export enum CompanyStatus {
  PendingApproval = "pending_approval",
  Active = "active",
  Suspended = "suspended",
  Revoked = "revoked",
  Rejected = "rejected",
}

export interface PartnerCompany {
  id: string;
  external1cId: string;
  displayName: string;
  status: CompanyStatus;
  createdAt: string;
  updatedAt: string;
}

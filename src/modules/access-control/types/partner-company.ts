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
  external1cContractId?: string | null;
  external1cPriceTypeId?: string | null;
  displayName: string;
  status: CompanyStatus;
  createdAt: string;
  updatedAt: string;
}

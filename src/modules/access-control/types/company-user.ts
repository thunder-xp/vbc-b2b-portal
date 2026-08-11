export type CompanyUserPriceAccess = "full" | "retail_only";
export type CompanyUserRecordType = "membership" | "invitation";

export type CompanyUserSummary = {
  recordType: CompanyUserRecordType;
  recordId: string;
  userId: string | null;
  fullName: string;
  email: string;
  roleCode: string;
  roleName: string;
  membershipStatus: string | null;
  invitationStatus: string | null;
  priceAccess: CompanyUserPriceAccess;
  joinedAt: string | null;
  createdAt: string;
};

export type CompanyUserPage = {
  records: CompanyUserSummary[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export type CompanyUserEvent = {
  id: string;
  targetUserId: string | null;
  targetInvitationId: string | null;
  actorUserId: string;
  eventType: string;
  safePayload: Readonly<Record<string, unknown>>;
  createdAt: string;
};

export type CompanyInvitationResult = {
  invitationId: string;
  email: string;
  fullName: string;
  expiresAt: string;
  tokenVersion: number;
  repeated: boolean;
};

export type CompanyInvitationAcceptance = {
  invitationId: string;
  membershipId: string;
  companyId: string;
  repeated: boolean;
};

export type CompanyInvitationPreview = {
  companyName: string;
  invitedEmail: string;
  invitedFullName: string;
  roleCode: string;
  expiresAt: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  accountExists: boolean;
};

export type ManageableCompany = {
  id: string;
  displayName: string;
};

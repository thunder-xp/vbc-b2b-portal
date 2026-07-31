export const ADMIN_USER_FILTERS = [
  "all",
  "internal",
  "partner",
  "active",
  "suspended",
  "invited",
  "retail_only",
  "owner",
  "no_role_assignment",
] as const;

export const ADMIN_INVITATION_FILTERS = [
  "all",
  "pending",
  "accepted",
  "expired",
  "revoked",
] as const;

export type AdminUserFilter = (typeof ADMIN_USER_FILTERS)[number];
export type AdminInvitationFilter =
  (typeof ADMIN_INVITATION_FILTERS)[number];

export type AdminUserSummary = {
  recordKey: string;
  userId: string | null;
  fullName: string;
  email: string;
  identityType: "internal" | "partner" | "invited";
  companyNames: string[];
  roleSummary: string | null;
  membershipStatus: string | null;
  priceAccess: string | null;
  invitationStatus: string | null;
  lastAccessEvent: string | null;
  lastAccessEventAt: string | null;
  createdAt: string;
  onboardingCapabilityEnabled: boolean;
};

export type AdminUserPage = {
  records: AdminUserSummary[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  search: string;
  filter: AdminUserFilter;
};

export type AdminInvitationSummary = {
  invitationId: string;
  companyId: string;
  companyName: string;
  email: string;
  fullName: string;
  roleCode: string;
  roleName: string;
  priceAccess: "full" | "retail_only";
  inviterName: string;
  invitationStatus: string;
  expiresAt: string | null;
  resendCount: number;
  createdAt: string;
};

export type AdminInvitationPage = {
  records: AdminInvitationSummary[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  search: string;
  filter: AdminInvitationFilter;
};

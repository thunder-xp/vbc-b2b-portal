import type {
  CompanyInvitationAcceptance,
  CompanyInvitationPreview,
  CompanyInvitationResult,
  CompanyUserEvent,
  CompanyUserPage,
  CompanyUserPriceAccess,
  ManageableCompany,
} from "../types";

export type CreateCompanyInvitationRecordInput = {
  companyId: string;
  fullName: string;
  email: string;
  roleCode: string;
  priceAccess: CompanyUserPriceAccess;
  tokenHash: string;
  expiresAt: string;
  requestKey: string;
};

export interface CompanyUserManagementRepository {
  list(companyId: string, page: number, pageSize: number): Promise<CompanyUserPage>;
  listEvents(companyId: string, limit: number): Promise<CompanyUserEvent[]>;
  listAdminCompanies(search?: string): Promise<ManageableCompany[]>;
  createInvitation(input: CreateCompanyInvitationRecordInput): Promise<CompanyInvitationResult>;
  reissueInvitation(invitationId: string, tokenHash: string, expiresAt: string): Promise<CompanyInvitationResult>;
  revokeInvitation(invitationId: string, reason: string): Promise<void>;
  recordInvitationDelivery(invitationId: string, status: "sent" | "failed"): Promise<void>;
  getInvitationPreview(tokenHash: string): Promise<CompanyInvitationPreview | null>;
  acceptInvitation(tokenHash: string): Promise<CompanyInvitationAcceptance>;
  revokeMembershipAccess(membershipId: string, reason: string): Promise<void>;
  setMembershipState(membershipId: string, status: "active" | "suspended", reason: string): Promise<void>;
  updateMembershipAccess(membershipId: string, roleCode: string, priceAccess: CompanyUserPriceAccess, reason: string): Promise<void>;
  appointOwner(membershipId: string, reason: string): Promise<void>;
  transferOwner(currentOwnerMembershipId: string, nextOwnerMembershipId: string, reason: string): Promise<void>;
  setPermissionOverride(
    membershipId: string,
    permissionCode: string,
    effect: "allow" | "deny" | "inherit",
    reason: string,
  ): Promise<void>;
}

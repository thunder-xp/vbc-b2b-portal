import type {
  CompanyInvitationAcceptance,
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
  revokeInvitation(invitationId: string): Promise<void>;
  acceptInvitation(tokenHash: string): Promise<CompanyInvitationAcceptance>;
  setMembershipState(membershipId: string, status: "active" | "suspended"): Promise<void>;
  updateMembershipAccess(membershipId: string, roleCode: string, priceAccess: CompanyUserPriceAccess): Promise<void>;
  appointOwner(membershipId: string): Promise<void>;
}

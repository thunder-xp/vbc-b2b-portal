import type { CompanyMembership, MembershipStatus } from "../types";

export interface CreateCompanyMembershipInput {
  userId: string;
  companyId: string;
  roleId: string;
  status?: MembershipStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
}

export interface UpdateCompanyMembershipStatusInput {
  membershipId: string;
  status: MembershipStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
  revokedBy?: string | null;
  revokedAt?: string | null;
}

export interface CompanyMembershipRepository {
  findByUserId(userId: string): Promise<CompanyMembership[]>;
  findActiveMembership(
    userId: string,
    companyId: string,
  ): Promise<CompanyMembership | null>;
  create(input: CreateCompanyMembershipInput): Promise<CompanyMembership>;
  updateStatus(
    input: UpdateCompanyMembershipStatusInput,
  ): Promise<CompanyMembership>;
}

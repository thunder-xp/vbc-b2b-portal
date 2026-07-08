import type {
  CompanyMembership,
  PartnerCompany,
  UserProfile,
} from "../types";

export interface ActiveCompanyContext {
  user: UserProfile;
  company: PartnerCompany;
  membership: CompanyMembership;
}

export interface CompanyAccessValidationResult {
  isAllowed: boolean;
  context: ActiveCompanyContext | null;
}

export interface CompanyAccessService {
  getOwnMemberships(userId: string): Promise<CompanyMembership[]>;
  getActiveCompanyContext(
    userId: string,
    companyId: string,
  ): Promise<ActiveCompanyContext>;
  validateCompanyAccess(
    userId: string,
    companyId: string,
  ): Promise<CompanyAccessValidationResult>;
  ensureActiveMembership(
    userId: string,
    companyId: string,
  ): Promise<CompanyMembership>;
}

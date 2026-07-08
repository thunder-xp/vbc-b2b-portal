import type { PartnerCompany } from "../types";

export interface PartnerCompanyRepository {
  findById(companyId: string): Promise<PartnerCompany | null>;
  findByExternal1cId(external1cId: string): Promise<PartnerCompany | null>;
  findCompaniesForUser(userId: string): Promise<PartnerCompany[]>;
}

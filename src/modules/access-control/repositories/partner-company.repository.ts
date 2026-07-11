import type { PartnerCompany } from "../types";

export interface CreatePartnerCompanyInput {
  external1cId: string;
  external1cCode?: string | null;
  external1cContractId?: string | null;
  external1cPriceTypeId?: string | null;
  displayName: string;
}

export interface UpdatePartnerCompanyApprovalBindingInput {
  companyId: string;
  external1cCode?: string | null;
  external1cContractId: string;
  external1cPriceTypeId: string;
  displayName?: string | null;
}

export interface PartnerCompanyRepository {
  findById(companyId: string): Promise<PartnerCompany | null>;
  findByExternal1cId(external1cId: string): Promise<PartnerCompany | null>;
  findCompaniesForUser(userId: string): Promise<PartnerCompany[]>;
  create(input: CreatePartnerCompanyInput): Promise<PartnerCompany>;
  updateApprovalBinding(
    input: UpdatePartnerCompanyApprovalBindingInput,
  ): Promise<PartnerCompany>;
}

import { createClient } from "@/src/lib/supabase/server";

import type {
  CreatePartnerCompanyInput,
  PartnerCompanyRepository,
  UpdatePartnerCompanyApprovalBindingInput,
} from "../partner-company.repository";
import type { PartnerCompany } from "../../types";
import { CompanyStatus } from "../../types";
import {
  mapPartnerCompanyRow,
  type PartnerCompanyRow,
} from "./mappers";
import { RepositoryUnexpectedError } from "../index";

const PARTNER_COMPANY_COLUMNS =
  "id, external_1c_id, external_1c_code, external_1c_contract_id, external_1c_price_type_id, display_name, status, created_at, updated_at";
const COMPANY_MEMBERSHIP_COMPANY_COLUMNS = "company_id";

interface CompanyMembershipCompanyIdRow {
  company_id: string;
}

export class SupabasePartnerCompanyRepository
  implements PartnerCompanyRepository
{
  async findById(companyId: string): Promise<PartnerCompany | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("partner_companies")
      .select(PARTNER_COMPANY_COLUMNS)
      .eq("id", companyId)
      .maybeSingle();

    if (error) {
      throw new RepositoryUnexpectedError();
    }

    return data ? mapPartnerCompanyRow(data as PartnerCompanyRow) : null;
  }

  async findByExternal1cId(
    external1cId: string,
  ): Promise<PartnerCompany | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("partner_companies")
      .select(PARTNER_COMPANY_COLUMNS)
      .eq("external_1c_id", external1cId)
      .maybeSingle();

    if (error) {
      throw new RepositoryUnexpectedError();
    }

    return data ? mapPartnerCompanyRow(data as PartnerCompanyRow) : null;
  }

  async findCompaniesForUser(userId: string): Promise<PartnerCompany[]> {
    const supabase = await createClient();
    const { data: membershipRows, error: membershipError } = await supabase
      .from("company_memberships")
      .select(COMPANY_MEMBERSHIP_COMPANY_COLUMNS)
      .eq("user_id", userId);

    if (membershipError) {
      throw new RepositoryUnexpectedError();
    }

    const companyIds = (membershipRows as CompanyMembershipCompanyIdRow[]).map(
      (row) => row.company_id,
    );

    if (companyIds.length === 0) {
      return [];
    }

    const { data, error } = await supabase
      .from("partner_companies")
      .select(PARTNER_COMPANY_COLUMNS)
      .in("id", companyIds);

    if (error) {
      throw new RepositoryUnexpectedError();
    }

    return (data as PartnerCompanyRow[]).map(mapPartnerCompanyRow);
  }

  async create(input: CreatePartnerCompanyInput): Promise<PartnerCompany> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("partner_companies")
      .insert({
        external_1c_id: input.external1cId,
        external_1c_code: input.external1cCode ?? null,
        external_1c_contract_id: input.external1cContractId ?? null,
        external_1c_price_type_id: input.external1cPriceTypeId ?? null,
        display_name: input.displayName,
        status: CompanyStatus.Active,
      })
      .select(PARTNER_COMPANY_COLUMNS)
      .single();

    if (error) {
      throw new RepositoryUnexpectedError();
    }

    return mapPartnerCompanyRow(data as PartnerCompanyRow);
  }

  async updateApprovalBinding(
    input: UpdatePartnerCompanyApprovalBindingInput,
  ): Promise<PartnerCompany> {
    const supabase = await createClient();
    const updatePayload: {
      external_1c_contract_id: string;
      external_1c_price_type_id: string;
      external_1c_code?: string;
      display_name?: string;
      status: CompanyStatus;
    } = {
      external_1c_contract_id: input.external1cContractId,
      external_1c_price_type_id: input.external1cPriceTypeId,
      status: CompanyStatus.Active,
    };

    if (input.external1cCode) {
      updatePayload.external_1c_code = input.external1cCode;
    }

    if (input.displayName) {
      updatePayload.display_name = input.displayName;
    }

    const { data, error } = await supabase
      .from("partner_companies")
      .update(updatePayload)
      .eq("id", input.companyId)
      .select(PARTNER_COMPANY_COLUMNS)
      .single();

    if (error) {
      throw new RepositoryUnexpectedError();
    }

    return mapPartnerCompanyRow(data as PartnerCompanyRow);
  }
}

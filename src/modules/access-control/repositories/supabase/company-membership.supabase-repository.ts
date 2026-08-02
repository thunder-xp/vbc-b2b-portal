import { createClient } from "@/src/lib/supabase/server";

import type {
  CompanyMembershipRepository,
  CreateCompanyMembershipInput,
  UpdateCompanyMembershipStatusInput,
} from "../company-membership.repository";
import { MembershipStatus, type CompanyMembership } from "../../types";
import {
  mapCompanyMembershipRow,
  type CompanyMembershipRow,
} from "./mappers";
import {
  RepositoryOperationNotAvailableError,
  RepositoryUnexpectedError,
} from "../index";

const COMPANY_MEMBERSHIP_COLUMNS =
  "id, user_id, company_id, role_id, status, approved_by, approved_at, revoked_by, revoked_at, created_at, updated_at";

export class SupabaseCompanyMembershipRepository
  implements CompanyMembershipRepository
{
  async findByUserId(userId: string): Promise<CompanyMembership[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("list_own_company_memberships");

    const rows = (data ?? []) as CompanyMembershipRow[];
    if (error || rows.some((row) => row.user_id !== userId)) {
      throw new RepositoryUnexpectedError();
    }

    return rows.map(mapCompanyMembershipRow);
  }

  async findActiveMembership(
    userId: string,
    companyId: string,
  ): Promise<CompanyMembership | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("company_memberships")
      .select(COMPANY_MEMBERSHIP_COLUMNS)
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .eq("status", MembershipStatus.Active)
      .maybeSingle();

    if (error) {
      throw new RepositoryUnexpectedError();
    }

    return data ? mapCompanyMembershipRow(data as CompanyMembershipRow) : null;
  }

  async create(
    input: CreateCompanyMembershipInput,
  ): Promise<CompanyMembership> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "create_approved_company_membership",
      {
        p_user_id: input.userId,
        p_company_id: input.companyId,
        p_role_id: input.roleId,
        p_status: input.status ?? MembershipStatus.PendingApproval,
        p_approved_by: input.approvedBy ?? null,
        p_approved_at: input.approvedAt ?? null,
      },
    );

    if (error) {
      throw new RepositoryUnexpectedError();
    }

    return mapCompanyMembershipRow(data as CompanyMembershipRow);
  }

  async updateStatus(
    input: UpdateCompanyMembershipStatusInput,
  ): Promise<CompanyMembership> {
    void input;
    throw new RepositoryOperationNotAvailableError(
      "company_memberships.updateStatus",
    );
  }
}

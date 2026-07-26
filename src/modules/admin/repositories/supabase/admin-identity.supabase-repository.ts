import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { RepositoryUnexpectedError } from "@/src/modules/access-control/repositories";

import type {
  AdminIdentityRepository,
  ListAdminInvitationsRepositoryInput,
  ListAdminUsersRepositoryInput,
} from "../admin-identity.repository";
import type {
  AdminInvitationPage,
  AdminInvitationSummary,
  AdminUserPage,
  AdminUserSummary,
} from "../../types";

type AdminUserRow = {
  record_key: string;
  user_id: string | null;
  full_name: string;
  email: string;
  identity_type: AdminUserSummary["identityType"];
  company_names: string[] | null;
  role_summary: string | null;
  membership_status: string | null;
  price_access: string | null;
  invitation_status: string | null;
  last_access_event: string | null;
  last_access_event_at: string | null;
  created_at: string;
  total_count: number | string;
};

type AdminInvitationRow = {
  invitation_id: string;
  company_id: string;
  company_name: string;
  email: string;
  full_name: string;
  role_code: string;
  role_name: string;
  price_access: "full" | "retail_only";
  inviter_name: string;
  invitation_status: string;
  expires_at: string | null;
  resend_count: number | string;
  created_at: string;
  total_count: number | string;
};

export class SupabaseAdminIdentityRepository
  implements AdminIdentityRepository
{
  async listUsers(input: ListAdminUsersRepositoryInput): Promise<AdminUserPage> {
    const rows = await this.call<AdminUserRow[]>("list_admin_users", {
      p_page: input.page,
      p_page_size: input.pageSize,
      p_search: input.search || null,
      p_filter: input.filter,
    });
    const totalCount = Number(rows[0]?.total_count ?? 0);
    return {
      records: rows.map(mapUser),
      page: input.page,
      pageSize: input.pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / input.pageSize)),
      search: input.search,
      filter: input.filter,
    };
  }

  async listInvitations(
    input: ListAdminInvitationsRepositoryInput,
  ): Promise<AdminInvitationPage> {
    const rows = await this.call<AdminInvitationRow[]>(
      "list_admin_invitations",
      {
        p_page: input.page,
        p_page_size: input.pageSize,
        p_search: input.search || null,
        p_filter: input.filter,
      },
    );
    const totalCount = Number(rows[0]?.total_count ?? 0);
    return {
      records: rows.map(mapInvitation),
      page: input.page,
      pageSize: input.pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / input.pageSize)),
      search: input.search,
      filter: input.filter,
    };
  }

  private async call<T>(
    operation: string,
    input: Record<string, unknown>,
  ): Promise<T> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(operation, input);
    if (error || data === null) {
      throw new RepositoryUnexpectedError({
        operation,
        table: "admin_identity_projection",
        payloadKeys: Object.keys(input),
        cause: error,
      });
    }
    return data as T;
  }
}

function mapUser(row: AdminUserRow): AdminUserSummary {
  return {
    recordKey: row.record_key,
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    identityType: row.identity_type,
    companyNames: row.company_names ?? [],
    roleSummary: row.role_summary,
    membershipStatus: row.membership_status,
    priceAccess: row.price_access,
    invitationStatus: row.invitation_status,
    lastAccessEvent: row.last_access_event,
    lastAccessEventAt: row.last_access_event_at,
    createdAt: row.created_at,
  };
}

function mapInvitation(row: AdminInvitationRow): AdminInvitationSummary {
  return {
    invitationId: row.invitation_id,
    companyId: row.company_id,
    companyName: row.company_name,
    email: row.email,
    fullName: row.full_name,
    roleCode: row.role_code,
    roleName: row.role_name,
    priceAccess: row.price_access,
    inviterName: row.inviter_name,
    invitationStatus: row.invitation_status,
    expiresAt: row.expires_at,
    resendCount: Number(row.resend_count),
    createdAt: row.created_at,
  };
}

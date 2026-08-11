import { createClient } from "@/src/lib/supabase/server";

import type {
  CompanyInvitationAcceptance,
  CompanyInvitationPreview,
  CompanyInvitationResult,
  CompanyUserEvent,
  CompanyUserPage,
  CompanyUserSummary,
  ManageableCompany,
} from "../../types";
import type {
  CompanyUserManagementRepository,
  CreateCompanyInvitationRecordInput,
} from "../company-user-management.repository";
import { RepositoryUnexpectedError } from "../index";

type CompanyUserRow = {
  record_type: "membership" | "invitation";
  record_id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  role_code: string;
  role_name: string;
  membership_status: string | null;
  invitation_status: string | null;
  price_access: "full" | "retail_only";
  joined_at: string | null;
  created_at: string;
  total_count: number | string;
};

type InvitationResultRow = {
  invitation_id: string;
  normalized_email: string;
  full_name: string;
  expires_at: string;
  token_version: number;
  repeated?: boolean;
};

export class SupabaseCompanyUserManagementRepository
  implements CompanyUserManagementRepository
{
  async list(companyId: string, page: number, pageSize: number): Promise<CompanyUserPage> {
    const data = await this.rpc<CompanyUserRow[]>("list_company_users", {
      p_company_id: companyId,
      p_page: page,
      p_page_size: pageSize,
    });
    const rows = data ?? [];
    const totalCount = Number(rows[0]?.total_count ?? 0);
    return {
      records: rows.map(mapCompanyUser),
      page,
      pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    };
  }

  async listEvents(companyId: string, limit: number): Promise<CompanyUserEvent[]> {
    const rows = await this.rpc<Array<{
      id: string;
      target_user_id: string | null;
      target_invitation_id: string | null;
      actor_user_id: string;
      event_type: string;
      safe_payload: Record<string, unknown>;
      created_at: string;
    }>>("list_company_user_events", {
      p_company_id: companyId,
      p_limit: limit,
    });
    return (rows ?? []).map((row) => ({
      id: row.id,
      targetUserId: row.target_user_id,
      targetInvitationId: row.target_invitation_id,
      actorUserId: row.actor_user_id,
      eventType: row.event_type,
      safePayload: row.safe_payload,
      createdAt: row.created_at,
    }));
  }

  async listAdminCompanies(search?: string): Promise<ManageableCompany[]> {
    const rows = await this.rpc<Array<{ id: string; display_name: string }>>(
      "list_admin_partner_companies",
      { p_search: search?.trim() || null, p_limit: 100 },
    );
    return (rows ?? []).map((row) => ({ id: row.id, displayName: row.display_name }));
  }

  async createInvitation(input: CreateCompanyInvitationRecordInput): Promise<CompanyInvitationResult> {
    const rows = await this.rpc<InvitationResultRow[]>("create_company_invitation", {
      p_company_id: input.companyId,
      p_full_name: input.fullName,
      p_email: input.email,
      p_role_code: input.roleCode,
      p_price_access: input.priceAccess,
      p_token_hash: input.tokenHash,
      p_expires_at: input.expiresAt,
      p_request_key: input.requestKey,
    });
    return mapInvitationResult(requiredRow(rows));
  }

  async reissueInvitation(invitationId: string, tokenHash: string, expiresAt: string): Promise<CompanyInvitationResult> {
    const rows = await this.rpc<InvitationResultRow[]>("reissue_company_invitation", {
      p_invitation_id: invitationId,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
    });
    return mapInvitationResult(requiredRow(rows));
  }

  async revokeInvitation(invitationId: string, reason: string): Promise<void> {
    await this.rpc("revoke_company_invitation_v2", {
      p_invitation_id: invitationId,
      p_reason: reason,
    });
  }

  async recordInvitationDelivery(invitationId: string, status: "sent" | "failed"): Promise<void> {
    await this.rpc("record_company_invitation_email_delivery", {
      p_invitation_id: invitationId,
      p_status: status,
    });
  }

  async getInvitationPreview(tokenHash: string): Promise<CompanyInvitationPreview | null> {
    const rows = await this.rpc<Array<{
      company_name: string;
      invited_email: string;
      invited_full_name: string;
      role_code: string;
      expires_at: string;
      invitation_status: CompanyInvitationPreview["status"];
      account_exists: boolean;
    }>>("get_company_invitation_preview", { p_token_hash: tokenHash });
    const row = rows?.[0];
    return row ? {
      companyName: row.company_name,
      invitedEmail: row.invited_email,
      invitedFullName: row.invited_full_name,
      roleCode: row.role_code,
      expiresAt: row.expires_at,
      status: row.invitation_status,
      accountExists: row.account_exists,
    } : null;
  }

  async acceptInvitation(tokenHash: string): Promise<CompanyInvitationAcceptance> {
    const rows = await this.rpc<Array<{
      invitation_id: string;
      membership_id: string;
      company_id: string;
      repeated: boolean;
    }>>("accept_company_invitation", { p_token_hash: tokenHash });
    const row = requiredRow(rows);
    return {
      invitationId: row.invitation_id,
      membershipId: row.membership_id,
      companyId: row.company_id,
      repeated: row.repeated,
    };
  }

  async setMembershipState(membershipId: string, status: "active" | "suspended", reason: string): Promise<void> {
    await this.rpc("set_company_membership_state_v2", {
      p_membership_id: membershipId,
      p_target_status: status,
      p_reason: reason,
    });
  }

  async revokeMembershipAccess(membershipId: string, reason: string): Promise<void> {
    await this.rpc("revoke_company_membership_access", {
      p_membership_id: membershipId,
      p_reason: reason,
    });
  }

  async updateMembershipAccess(membershipId: string, roleCode: string, priceAccess: "full" | "retail_only", reason: string): Promise<void> {
    await this.rpc("update_company_membership_access_v2", {
      p_membership_id: membershipId,
      p_role_code: roleCode,
      p_price_access: priceAccess,
      p_reason: reason,
    });
  }

  async appointOwner(membershipId: string, reason: string): Promise<void> {
    await this.rpc("appoint_company_owner_v2", {
      p_membership_id: membershipId,
      p_reason: reason,
    });
  }

  async transferOwner(currentOwnerMembershipId: string, nextOwnerMembershipId: string, reason: string): Promise<void> {
    await this.rpc("transfer_company_owner_v2", {
      p_current_owner_membership_id: currentOwnerMembershipId,
      p_next_owner_membership_id: nextOwnerMembershipId,
      p_reason: reason,
    });
  }

  async setPermissionOverride(
    membershipId: string,
    permissionCode: string,
    effect: "allow" | "deny" | "inherit",
    reason: string,
  ): Promise<void> {
    await this.rpc("set_membership_permission_override", {
      p_membership_id: membershipId,
      p_permission_code: permissionCode,
      p_effect: effect,
      p_reason: reason,
    });
  }

  private async rpc<T = unknown>(
    operation: string,
    input: Record<string, unknown>,
  ): Promise<T | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(operation, input);
    if (error) {
      throw new RepositoryUnexpectedError({
        operation,
        table: "company_user_management",
        payloadKeys: Object.keys(input),
        cause: error,
      });
    }
    return data as T | null;
  }
}

function mapCompanyUser(row: CompanyUserRow): CompanyUserSummary {
  return {
    recordType: row.record_type,
    recordId: row.record_id,
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    roleCode: row.role_code,
    roleName: row.role_name,
    membershipStatus: row.membership_status,
    invitationStatus: row.invitation_status,
    priceAccess: row.price_access,
    joinedAt: row.joined_at,
    createdAt: row.created_at,
  };
}

function mapInvitationResult(row: InvitationResultRow): CompanyInvitationResult {
  return {
    invitationId: row.invitation_id,
    email: row.normalized_email,
    fullName: row.full_name,
    expiresAt: row.expires_at,
    tokenVersion: row.token_version,
    repeated: row.repeated ?? false,
  };
}

function requiredRow<T>(rows: T[] | null): T {
  const row = rows?.[0];
  if (!row) {
    throw new RepositoryUnexpectedError({
      operation: "map_company_user_rpc",
      table: "company_user_management",
    });
  }
  return row;
}

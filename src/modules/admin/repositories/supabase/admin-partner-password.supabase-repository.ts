import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";

import {
  AdminPartnerPasswordProviderFailure,
  type AdminPartnerPasswordAuditInput,
  type AdminPartnerPasswordRepository,
  type AdminPartnerAuthIdentity,
} from "../admin-partner-password.repository";

export class SupabaseAdminPartnerPasswordRepository implements AdminPartnerPasswordRepository {
  async getAuthIdentity(authUserId: string): Promise<AdminPartnerAuthIdentity | null> {
    const { data, error } = await createAdminClient().auth.admin.getUserById(authUserId);
    if (error) {
      if (error.status === 404) return null;
      throw new AdminPartnerPasswordProviderFailure("AUTH_LOOKUP_FAILED");
    }
    if (!data.user) return null;
    const providers = Array.isArray(data.user.app_metadata.providers)
      ? data.user.app_metadata.providers
      : [];
    return {
      id: data.user.id,
      email: data.user.email ?? null,
      hasEmailIdentity: data.user.app_metadata.provider === "email"
        || providers.includes("email")
        || (data.user.identities ?? []).some((identity) => identity.provider === "email"),
      isAnonymous: data.user.is_anonymous === true,
    };
  }

  async changePasswordAndRevokeTargetSessions(authUserId: string, newPassword: string): Promise<void> {
    // Supabase Auth's admin update handler applies UpdatePassword(tx, nil), which
    // invalidates every target-user session in the same provider transaction.
    const { error } = await createAdminClient().auth.admin.updateUserById(authUserId, {
      password: newPassword,
    });
    if (error) throw new AdminPartnerPasswordProviderFailure("AUTH_UPDATE_FAILED");
  }

  async recordPasswordChangeAudit(input: AdminPartnerPasswordAuditInput): Promise<string> {
    const { data, error } = await createAdminClient()
      .from("company_user_events")
      .insert({
        actor_user_id: input.actorUserId,
        company_id: input.targetCompanyId,
        event_type: "admin_intervention",
        safe_payload: {
          correlationId: input.correlationId,
          operation: "PARTNER_PASSWORD_CHANGED_BY_ADMIN",
          securityOutcome: "password_changed_existing_access_revoked",
        },
        target_user_id: input.targetUserId,
      })
      .select("id")
      .single();
    if (error || !data?.id) throw new AdminPartnerPasswordProviderFailure("AUDIT_WRITE_FAILED");
    return String(data.id);
  }
}

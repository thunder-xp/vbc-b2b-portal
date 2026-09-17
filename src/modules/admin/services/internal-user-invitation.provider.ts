import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";

export type InternalUserInvitation = { authUserId: string };

export interface InternalUserInvitationProvider {
  invite(email: string, displayName: string): Promise<InternalUserInvitation>;
  reissue(email: string, authUserId: string, emailConfirmed: boolean): Promise<void>;
  remove(authUserId: string): Promise<void>;
}

export class InternalUserInvitationProviderError extends Error {
  constructor(public readonly safeCode: "AUTH_INVITE_FAILED" | "AUTH_INVITE_RESULT_INVALID" | "AUTH_REISSUE_FAILED" | "AUTH_CLEANUP_FAILED") {
    super(safeCode);
    this.name = "InternalUserInvitationProviderError";
  }
}

export class SupabaseInternalUserInvitationProvider implements InternalUserInvitationProvider {
  async invite(email: string, displayName: string): Promise<InternalUserInvitation> {
    const { data, error } = await createAdminClient().auth.admin.inviteUserByEmail(email, {
      data: { full_name: displayName, provisioning_source: "internal_finance_operator" },
      redirectTo: internalInvitationRedirectUrl(),
    });
    if (error) throw new InternalUserInvitationProviderError("AUTH_INVITE_FAILED");
    if (!data.user?.id) throw new InternalUserInvitationProviderError("AUTH_INVITE_RESULT_INVALID");
    return { authUserId: data.user.id };
  }

  async reissue(email: string, authUserId: string, emailConfirmed: boolean): Promise<void> {
    const client = createAdminClient();
    if (emailConfirmed) {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: internalInvitationRedirectUrl(),
      });
      if (error) throw new InternalUserInvitationProviderError("AUTH_REISSUE_FAILED");
      return;
    }

    const { data, error } = await client.auth.admin.inviteUserByEmail(email, {
      redirectTo: internalInvitationRedirectUrl(),
    });
    if (error || data.user?.id !== authUserId) {
      throw new InternalUserInvitationProviderError("AUTH_REISSUE_FAILED");
    }
  }

  async remove(authUserId: string): Promise<void> {
    const { error } = await createAdminClient().auth.admin.deleteUser(authUserId, false);
    if (error) throw new InternalUserInvitationProviderError("AUTH_CLEANUP_FAILED");
  }
}

function internalInvitationRedirectUrl(): string {
  const configured = process.env.PUBLIC_APP_URL?.trim()
    || process.env.NEXT_PUBLIC_APP_URL?.trim()
    || "https://www.nsd.md";
  const origin = new URL(/^https?:\/\//i.test(configured) ? configured : `https://${configured}`);
  if (process.env.NODE_ENV === "production" && origin.protocol !== "https:") {
    throw new InternalUserInvitationProviderError("AUTH_INVITE_FAILED");
  }
  return new URL("/auth/internal-invitation", origin).toString();
}

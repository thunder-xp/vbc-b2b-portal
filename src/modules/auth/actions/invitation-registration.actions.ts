"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/src/lib/supabase/server";
import { createCompanyUserManagementService } from "@/src/modules/access-control/actions/service-factory";

import type { AuthActionState } from "./auth.actions";

export async function registerFromCompanyInvitationAction(
  token: string,
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const service = createCompanyUserManagementService();
  const invitation = await service.getInvitationPreview(token);
  if (!invitation || invitation.status !== "pending") {
    return { error: "Invitation is no longer available." };
  }
  if (invitation.accountExists) {
    return { error: "An account already exists for this email." };
  }
  const fullName = String(formData.get("fullName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  if (!fullName || fullName.length > 200 || !password || !confirmPassword) {
    return { error: "Complete all fields." };
  }
  if (password !== confirmPassword) return { error: "Passwords do not match." };
  if (password.length < 8) return { error: "Password must contain at least 8 characters." };

  const invitationPath = `/auth/invitations/${encodeURIComponent(token)}`;
  const callbackUrl = new URL("/auth/callback", applicationUrl());
  callbackUrl.searchParams.set("next", invitationPath);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: invitation.invitedEmail,
    password,
    options: {
      emailRedirectTo: callbackUrl.toString(),
      data: { full_name: fullName, signup_source: "company_invitation" },
    },
  });
  if (error) return { error: "Account could not be created." };
  if (data.session) {
    await service.acceptInvitation(token);
    redirect("/cabinet");
  }
  redirect(`${invitationPath}?registered=1`);
}

function applicationUrl(): string {
  const configured = process.env.PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://www.nsd.md";
  const url = new URL(configured);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("Public application URL is invalid.");
  }
  return url.origin;
}

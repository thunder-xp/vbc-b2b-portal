"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/src/lib/supabase/server";
import { createCompanyUserManagementService, createUserProfileService } from "@/src/modules/access-control/actions/service-factory";
import { createAdminInternalUserProvisioningService } from "@/src/modules/admin/services";
import { isPartnerLocale } from "@/src/modules/partner-locale";
import { setPartnerLocaleCookie } from "@/src/modules/partner-locale/server";
import {
  createBusinessAccessResolver,
  decideBusinessRoute,
  isUnifiedBusinessRoutingEnabled,
} from "../access-context";
import { safeRelativeAuthRedirect } from "../redirects";

export type AuthActionState = {
  error: string | null;
};

export async function signInAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const nextPath = safeRelativeAuthRedirect(formData.get("next"));

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Email or password is incorrect." };
  }

  if (nextPath === "/auth/internal-invitation") {
    let activationFailed = false;
    try {
      await createAdminInternalUserProvisioningService().activateCurrent();
    } catch {
      activationFailed = true;
    }
    if (activationFailed) redirect("/auth/internal-invitation?invite_error=invalid");
    redirect("/admin");
  }

  if (data.user?.id) {
    try {
      const profile = await createUserProfileService().getCurrentProfile(data.user.id);
      if (isPartnerLocale(profile?.preferredLocale)) {
        await setPartnerLocaleCookie(profile.preferredLocale);
      }
    } catch {
      // Authentication must remain available if the optional preference read fails.
    }
  }

  const invitationToken = tokenFromInvitationPath(nextPath);
  if (invitationToken) {
    try {
      await createCompanyUserManagementService().acceptInvitation(invitationToken);
    } catch {
      redirect(`${nextPath}?error=acceptance_failed`);
    }
    redirect("/cabinet");
  }

  // Internal/Admin authentication keeps its existing protected route. The
  // destination guard remains authoritative; Unified Auth only resolves
  // public Partner/Agent business contexts.
  if (nextPath?.startsWith("/admin")) redirect(nextPath);

  if (isUnifiedBusinessRoutingEnabled() && data.user?.id) {
    let targetRoute: "/cabinet" | "/agent" | "/auth/select-context" | "/auth/business-access-state";
    try {
      const resolution = await createBusinessAccessResolver().resolve(data.user.id);
      targetRoute = decideBusinessRoute(resolution).targetRoute;
    } catch {
      redirect("/auth/business-access-state?error=resolution");
    }
    redirect(targetRoute);
  }
  redirect(nextPath ?? "/cabinet");
}

export async function registerAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const company = String(formData.get("company") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const locale = String(formData.get("locale") ?? "");
  const nextPath = safeRelativeAuthRedirect(formData.get("next"));

  if (!company || !country || !email || !password || !confirmPassword) {
    return { error: "Complete all fields." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        requested_company_name: company,
        country,
      },
    },
  });

  if (error) {
    return { error: "Account could not be created." };
  }

  const query = new URLSearchParams({ registered: "1" });
  if (locale === "ru" || locale === "ro") query.set("lang", locale);
  if (nextPath) query.set("next", nextPath);
  redirect(`/auth/sign-in?${query.toString()}`);
}

function tokenFromInvitationPath(path: string | null): string | null {
  if (!path) return null;
  const match = /^\/auth\/invitations\/([A-Za-z0-9_-]{20,256})$/.exec(path);
  return match?.[1] ?? null;
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

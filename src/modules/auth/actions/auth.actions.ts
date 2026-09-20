"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/src/lib/supabase/server";
import { createCompanyUserManagementService, createUserProfileService } from "@/src/modules/access-control/actions/service-factory";
import {
  createAdminInternalUserProvisioningService,
} from "@/src/modules/admin/services";
import { isPartnerLocale } from "@/src/modules/partner-locale";
import { setPartnerLocaleCookie } from "@/src/modules/partner-locale/server";
import { isBusinessPhoneOtpEnabled } from "@/src/modules/quick-auth/factory";
import {
  isUnifiedBusinessRoutingEnabled,
} from "../access-context";
import { resolvePostSignInAccess } from "../post-sign-in-routing";
import { registrationEmailRedirectUrl } from "../registration.server";
import {
  professionalRegistrationContinuation,
  safeRelativeAuthRedirect,
} from "../redirects";

export type AuthActionState = {
  error: string | null;
};

export async function signInAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const locale = String(formData.get("lang") ?? "") === "ro" ? "ro" : "ru";
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

  // A validated same-origin continuation is explicit user intent. The target
  // page remains responsible for its own authorization and onboarding gates.
  if (nextPath) redirect(nextPath);

  if (isUnifiedBusinessRoutingEnabled() && data.user?.id) {
    let targetRoute: string;
    let enrollmentRoute: string | null = null;
    try {
      const decision = await resolvePostSignInAccess(data.user.id, data.user.user_metadata);
      targetRoute = decision.targetRoute;
      if (
        isBusinessPhoneOtpEnabled()
        && (targetRoute === "/cabinet" || targetRoute === "/agent")
        && !(data.user.phone && data.user.phone_confirmed_at)
      ) {
        const query = new URLSearchParams({ lang: locale, next: targetRoute });
        enrollmentRoute = `/auth/business-phone-enrollment?${query.toString()}`;
      }
    } catch {
      redirect("/auth/business-access-state?error=resolution");
    }
    if (enrollmentRoute) redirect(enrollmentRoute);
    redirect(targetRoute);
  }
  redirect(nextPath ?? "/cabinet");
}

export async function registerAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const intent = String(formData.get("intent") ?? "installer") === "agent" ? "agent" : "installer";
  const locale = String(formData.get("locale") ?? "") === "ro" ? "ro" : "ru";
  const legalForm = String(formData.get("legalForm") ?? "") === "LEGAL_ENTITY" ? "LEGAL_ENTITY" : "INDIVIDUAL";
  const nextPath = professionalRegistrationContinuation(intent, locale, formData.get("next"));

  if (!email || !password || !confirmPassword) {
    return { error: "Complete all fields." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: registrationEmailRedirectUrl(intent, locale, nextPath),
      data: {
        registration_intent: intent,
        registration_legal_form: legalForm,
        preferred_registration_locale: locale,
      },
    },
  });

  if (error) {
    return { error: "Account could not be created." };
  }

  if (data.session) redirect(nextPath);

  const query = new URLSearchParams({ lang: locale, intent, next: nextPath });
  redirect(`/auth/check-email?${query.toString()}`);
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

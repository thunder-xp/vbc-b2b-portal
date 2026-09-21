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
import { resolveAuthorizedPostSignInTarget, resolvePostSignInAccess } from "../post-sign-in-routing";
import { registrationEmailRedirectUrl } from "../registration.server";
import {
  classifyPostSignInContinuation,
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
  const continuation = classifyPostSignInContinuation(nextPath);

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Email or password is incorrect." };
  }

  if (continuation?.kind === "INTERNAL_INVITATION") {
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

  if (continuation?.kind === "COMPANY_INVITATION") {
    try {
      await createCompanyUserManagementService().acceptInvitation(continuation.token);
    } catch {
      redirect(`${continuation.path}?error=acceptance_failed`);
    }
    redirect("/cabinet");
  }

  if (continuation?.kind === "GOVERNED_ONBOARDING") redirect(continuation.path);

  if (!data.user?.id) redirect("/auth/business-access-state?error=resolution");

  let targetRoute: string;
  let enrollmentRoute: string | null = null;
  try {
    const decision = await resolvePostSignInAccess(data.user.id, data.user.user_metadata);
    targetRoute = resolveAuthorizedPostSignInTarget(decision, continuation);
    if (
      isBusinessPhoneOtpEnabled()
      && decision.requiresBusinessPhoneEnrollment
      && !(data.user.phone && data.user.phone_confirmed_at)
    ) {
      const query = new URLSearchParams({ lang: locale, next: decision.targetRoute });
      enrollmentRoute = `/auth/business-phone-enrollment?${query.toString()}`;
    }
  } catch {
    redirect("/auth/business-access-state?error=resolution");
  }
  if (enrollmentRoute) redirect(enrollmentRoute);
  redirect(targetRoute);
}

export async function registerAgentAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  return registerProfessionalAction("agent", formData);
}

export async function registerInstallerAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  return registerProfessionalAction("installer", formData);
}

async function registerProfessionalAction(
  intent: "agent" | "installer",
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const locale = String(formData.get("locale") ?? "") === "ro" ? "ro" : "ru";
  const legalForm = String(formData.get("legalForm") ?? "") === "LEGAL_ENTITY" ? "LEGAL_ENTITY" : "INDIVIDUAL";
  const nextPath = professionalRegistrationContinuation(intent, locale);

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

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

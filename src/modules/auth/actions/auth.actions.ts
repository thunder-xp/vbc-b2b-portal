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
  PartnerRegistrationStateError,
  resolvePartnerRegistrationIdentityState,
} from "../partner-registration-state";
import {
  classifyPostSignInContinuation,
  professionalRegistrationContinuation,
  safeRelativeAuthRedirect,
} from "../redirects";

export type AuthActionState = {
  error: string | null;
  status?: "CONFIRMATION_PENDING" | "CONFIRMATION_SENT";
  email?: string;
  intent?: "agent" | "installer";
  locale?: "ru" | "ro";
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

export async function resendProfessionalConfirmationAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const intent = String(formData.get("intent") ?? "") === "installer" ? "installer" : "agent";
  const locale = String(formData.get("locale") ?? "") === "ro" ? "ro" : "ru";
  if (!isBasicEmailSyntax(email)) return { error: "INVALID_SYNTAX" };

  let identityState: Awaited<ReturnType<typeof resolvePartnerRegistrationIdentityState>>;
  try {
    identityState = await resolvePartnerRegistrationIdentityState(email);
  } catch (error) {
    if (error instanceof PartnerRegistrationStateError) return { error: "TEMPORARY_EMAIL_VALIDATION" };
    return { error: "DELIVERY_FAILURE" };
  }
  if (identityState === "MISSING") return { error: "ACCOUNT_NOT_FOUND" };
  if (identityState === "CONFIRMED") return { error: "ACCOUNT_EXISTS" };

  const nextPath = professionalRegistrationContinuation(intent, locale);
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: registrationEmailRedirectUrl(intent, locale, nextPath) },
  });
  if (error) return { error: classifyRegistrationError(error) };
  return { error: null, status: "CONFIRMATION_SENT", email, intent, locale };
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
    return { error: "REQUIRED_FIELDS" };
  }

  if (password !== confirmPassword) {
    return { error: "PASSWORD_MISMATCH" };
  }

  if (!isBasicEmailSyntax(email)) return { error: "INVALID_SYNTAX" };

  try {
    const identityState = await resolvePartnerRegistrationIdentityState(email);
    if (identityState === "UNCONFIRMED") {
      return { error: null, status: "CONFIRMATION_PENDING", email, intent, locale };
    }
    if (identityState === "CONFIRMED") return { error: "ACCOUNT_EXISTS" };
  } catch (error) {
    if (error instanceof PartnerRegistrationStateError) return { error: "TEMPORARY_EMAIL_VALIDATION" };
    return { error: "DELIVERY_FAILURE" };
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
    return { error: classifyRegistrationError(error) };
  }

  if (data.session) redirect(nextPath);

  const query = new URLSearchParams({ lang: locale, intent, next: nextPath });
  redirect(`/auth/check-email?${query.toString()}`);
}

function classifyRegistrationError(error: { code?: string; status?: number; message?: string }): string {
  const code = error.code?.toLowerCase() ?? "";
  if (error.status === 429 || code.includes("rate_limit")) return "RATE_LIMIT";
  if (code === "email_address_invalid") return "TEMPORARY_EMAIL_VALIDATION";
  if (code === "email_exists" || code === "user_already_exists") return "ACCOUNT_EXISTS";
  if (error.status && error.status >= 500) return "DELIVERY_FAILURE";
  return "DELIVERY_FAILURE";
}

function isBasicEmailSyntax(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(value);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

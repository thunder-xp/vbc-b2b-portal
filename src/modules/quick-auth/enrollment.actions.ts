"use server";

import { createBusinessPhoneEnrollmentService } from "./enrollment.factory";
import { canonicalMoldovaE164 } from "@/src/modules/final-customer-auth/auth-phone";
import {
  createUserProfileService,
  getAuthenticatedUserId,
} from "@/src/modules/access-control/actions/service-factory";
import type { BusinessPhoneEnrollmentPublicState } from "./enrollment.types";

export type BusinessProfileSaveResult = {
  success: boolean;
  message: string;
  profile: {
    id: string;
    email: string;
    fullName: string | null;
    phone: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
  } | null;
  phoneVerification: BusinessPhoneEnrollmentPublicState | null;
};

export async function saveBusinessProfileAction(input: {
  fullName?: string | null;
  targetPhone?: string | null;
}): Promise<BusinessProfileSaveResult> {
  try {
    const userId = await getAuthenticatedUserId();
    const profiles = createUserProfileService();
    const current = await profiles.getCurrentProfile(userId);
    if (!current) return failedProfileSave();

    const fullName = typeof input.fullName === "string" && input.fullName.trim()
      ? input.fullName.trim()
      : null;
    let profile = await profiles.updateOwnProfile(userId, { fullName });
    const targetPhone = canonicalMoldovaE164(input.targetPhone ?? "");
    if (!targetPhone) {
      return {
        success: true,
        message: "PROFILE_SAVED",
        profile: profileDto(profile),
        phoneVerification: { ok: false, error: "INVALID_PHONE" },
      };
    }
    const currentPhone = current.phone ? canonicalMoldovaE164(current.phone) : null;
    if (targetPhone === currentPhone) {
      return {
        success: true,
        message: "PROFILE_SAVED",
        profile: profileDto(profile),
        phoneVerification: null,
      };
    }

    const verification = await createBusinessPhoneEnrollmentService().start(targetPhone);
    if (verification.ok && verification.step === "CONFIRMED") {
      profile = await profiles.updateOwnProfile(userId, { phone: targetPhone });
    }
    return {
      success: true,
      message: verification.ok && verification.step === "OTP"
        ? "PHONE_VERIFICATION_REQUIRED"
        : "PROFILE_SAVED",
      profile: profileDto(profile),
      phoneVerification: verification,
    };
  } catch {
    return failedProfileSave();
  }
}

export async function startBusinessPhoneEnrollmentAction(targetPhone: string): Promise<BusinessPhoneEnrollmentPublicState> {
  return createBusinessPhoneEnrollmentService().start(targetPhone);
}

export async function resendBusinessPhoneEnrollmentAction(challengeId: string): Promise<BusinessPhoneEnrollmentPublicState> {
  return createBusinessPhoneEnrollmentService().resend(challengeId);
}

export async function verifyBusinessPhoneEnrollmentAction(challengeId: string, rawToken: string): Promise<BusinessPhoneEnrollmentPublicState> {
  return createBusinessPhoneEnrollmentService().verify(challengeId, rawToken.replace(/\D/g, ""));
}

export async function loadBusinessPhoneEnrollmentAction(challengeId: string): Promise<BusinessPhoneEnrollmentPublicState> {
  return createBusinessPhoneEnrollmentService().load(challengeId);
}

function failedProfileSave(): BusinessProfileSaveResult {
  return {
    success: false,
    message: "PROFILE_SAVE_FAILED",
    profile: null,
    phoneVerification: null,
  };
}

function profileDto(profile: {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}) {
  return profile;
}

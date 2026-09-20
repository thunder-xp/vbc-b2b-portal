"use server";

import { createBusinessPhoneEnrollmentService } from "./enrollment.factory";
import type { BusinessPhoneEnrollmentPublicState } from "./enrollment.types";

export async function startBusinessPhoneEnrollmentAction(rawPhone: string): Promise<BusinessPhoneEnrollmentPublicState> {
  return createBusinessPhoneEnrollmentService().start(rawPhone);
}

export async function resendBusinessPhoneEnrollmentAction(challengeId: string, rawPhone: string): Promise<BusinessPhoneEnrollmentPublicState> {
  return createBusinessPhoneEnrollmentService().resend(challengeId, rawPhone);
}

export async function verifyBusinessPhoneEnrollmentAction(challengeId: string, rawPhone: string, rawToken: string): Promise<BusinessPhoneEnrollmentPublicState> {
  return createBusinessPhoneEnrollmentService().verify(challengeId, rawPhone, rawToken.replace(/\D/g, ""));
}

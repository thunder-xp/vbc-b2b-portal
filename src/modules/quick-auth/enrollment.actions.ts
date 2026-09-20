"use server";

import { createBusinessPhoneEnrollmentService } from "./enrollment.factory";
import type { BusinessPhoneEnrollmentPublicState } from "./enrollment.types";

export async function startBusinessPhoneEnrollmentAction(): Promise<BusinessPhoneEnrollmentPublicState> {
  return createBusinessPhoneEnrollmentService().start();
}

export async function resendBusinessPhoneEnrollmentAction(challengeId: string): Promise<BusinessPhoneEnrollmentPublicState> {
  return createBusinessPhoneEnrollmentService().resend(challengeId);
}

export async function verifyBusinessPhoneEnrollmentAction(challengeId: string, rawToken: string): Promise<BusinessPhoneEnrollmentPublicState> {
  return createBusinessPhoneEnrollmentService().verify(challengeId, rawToken.replace(/\D/g, ""));
}

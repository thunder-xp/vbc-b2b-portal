import { canonicalMoldovaE164 } from "@/src/modules/final-customer-auth/auth-phone";

import type { BusinessPhoneEnrollmentAuthGateway } from "./enrollment.repository";

export const BUSINESS_PROFILE_PHONE_STATES = [
  "NOT_SET",
  "VERIFIED",
  "VERIFICATION_REQUIRED",
  "CONFLICT",
] as const;

export type BusinessProfilePhoneStateCode = (typeof BUSINESS_PROFILE_PHONE_STATES)[number];

export type BusinessProfilePhoneState = {
  authUserId: string;
  state: BusinessProfilePhoneStateCode;
  profilePhone: string | null;
  profilePhoneE164: string | null;
};

export type BusinessPhoneResolution = {
  source: "USER_PROFILE" | "COMMERCIAL_AGENT" | "MATCHING_MULTI_CONTEXT" | "NONE" | "CONFLICT";
  phoneE164: string | null;
};

export interface BusinessProfilePhoneStateRepository {
  resolvePhone(authUserId: string): Promise<BusinessPhoneResolution>;
  hasOperationalConflict(authUserId: string, phoneE164: string): Promise<boolean>;
}

export class BusinessProfilePhoneStateService {
  constructor(
    private readonly repository: BusinessProfilePhoneStateRepository,
    private readonly auth: Pick<BusinessPhoneEnrollmentAuthGateway, "currentUser">,
  ) {}

  async resolveCurrent(): Promise<BusinessProfilePhoneState | null> {
    const user = await this.auth.currentUser();
    if (!user) return null;

    const resolution = await this.repository.resolvePhone(user.id);
    const profilePhone = resolution.phoneE164;
    const profilePhoneE164 = profilePhone ? canonicalMoldovaE164(profilePhone) : null;

    if (resolution.source === "CONFLICT") {
      return { authUserId: user.id, state: "CONFLICT", profilePhone: null, profilePhoneE164: null };
    }

    if (!profilePhoneE164) {
      return { authUserId: user.id, state: "NOT_SET", profilePhone, profilePhoneE164: null };
    }

    const authPhoneE164 = user.phone ? canonicalMoldovaE164(user.phone) : null;
    if (user.phoneConfirmed && authPhoneE164 === profilePhoneE164) {
      return { authUserId: user.id, state: "VERIFIED", profilePhone, profilePhoneE164 };
    }

    const conflict = await this.repository.hasOperationalConflict(user.id, profilePhoneE164);
    return {
      authUserId: user.id,
      state: conflict ? "CONFLICT" : "VERIFICATION_REQUIRED",
      profilePhone,
      profilePhoneE164,
    };
  }
}

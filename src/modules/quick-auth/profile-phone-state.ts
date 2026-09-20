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

export interface BusinessProfilePhoneStateRepository {
  getProfilePhone(authUserId: string): Promise<string | null>;
  hasOperationalConflict(authUserId: string, phoneE164: string): Promise<boolean>;
}

export class BusinessProfilePhoneStateService {
  constructor(
    private readonly repository: BusinessProfilePhoneStateRepository,
    private readonly auth: BusinessPhoneEnrollmentAuthGateway,
  ) {}

  async resolveCurrent(input: { profilePhone?: string | null } = {}): Promise<BusinessProfilePhoneState | null> {
    const user = await this.auth.currentUser();
    if (!user) return null;

    const profilePhone = Object.hasOwn(input, "profilePhone")
      ? input.profilePhone ?? null
      : await this.repository.getProfilePhone(user.id);
    const profilePhoneE164 = profilePhone ? canonicalMoldovaE164(profilePhone) : null;

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

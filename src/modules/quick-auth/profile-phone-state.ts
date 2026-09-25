import { canonicalMoldovaE164 } from "@/src/modules/final-customer-auth/auth-phone";

import type { BusinessPhoneEnrollmentAuthGateway } from "./enrollment.repository";

export const BUSINESS_PROFILE_PHONE_STATES = [
  "NO_PHONE",
  "VERIFIED",
  "PHONE_VERIFICATION_REQUIRED",
  "OTP_SENT",
  "PHONE_CHANGE_PENDING",
  "VERIFICATION_FAILED",
  "CONFLICT",
] as const;

export type BusinessProfilePhoneStateCode = (typeof BUSINESS_PROFILE_PHONE_STATES)[number];

export type BusinessProfilePhoneState = {
  authUserId: string;
  state: BusinessProfilePhoneStateCode;
  profilePhone: string | null;
  profilePhoneE164: string | null;
  targetPhoneE164: string | null;
  challengeId: string | null;
};

export interface BusinessProfilePhoneStateRepository {
  getProfilePhone(authUserId: string): Promise<string | null>;
  hasOperationalConflict(authUserId: string, phoneE164: string): Promise<boolean>;
  getCanonicalState(authUserId: string): Promise<{
    state: Exclude<BusinessProfilePhoneStateCode, "CONFLICT">;
    challengeId: string | null;
    profilePhoneE164: string | null;
    targetPhoneE164: string | null;
  } | null>;
}

export class BusinessProfilePhoneStateService {
  constructor(
    private readonly repository: BusinessProfilePhoneStateRepository,
    private readonly auth: Pick<BusinessPhoneEnrollmentAuthGateway, "currentUser">,
  ) {}

  async resolveCurrent(input: { profilePhone?: string | null } = {}): Promise<BusinessProfilePhoneState | null> {
    const user = await this.auth.currentUser();
    if (!user) return null;

    const canonical = await this.repository.getCanonicalState(user.id);
    if (canonical) {
      if (canonical.state === "PHONE_VERIFICATION_REQUIRED" && canonical.targetPhoneE164) {
        const conflict = await this.repository.hasOperationalConflict(user.id, canonical.targetPhoneE164);
        if (conflict) {
          return {
            authUserId: user.id,
            state: "CONFLICT",
            profilePhone: canonical.profilePhoneE164,
            profilePhoneE164: canonical.profilePhoneE164,
            targetPhoneE164: canonical.targetPhoneE164,
            challengeId: canonical.challengeId,
          };
        }
      }
      return {
        authUserId: user.id,
        state: canonical.state,
        profilePhone: canonical.profilePhoneE164,
        profilePhoneE164: canonical.profilePhoneE164,
        targetPhoneE164: canonical.targetPhoneE164,
        challengeId: canonical.challengeId,
      };
    }

    const profilePhone = Object.hasOwn(input, "profilePhone")
      ? input.profilePhone ?? null
      : await this.repository.getProfilePhone(user.id);
    const profilePhoneE164 = profilePhone ? canonicalMoldovaE164(profilePhone) : null;

    if (!profilePhoneE164) {
      return {
        authUserId: user.id,
        state: "NO_PHONE",
        profilePhone,
        profilePhoneE164: null,
        targetPhoneE164: null,
        challengeId: null,
      };
    }

    const authPhoneE164 = user.phone ? canonicalMoldovaE164(user.phone) : null;
    if (user.phoneConfirmed && authPhoneE164 === profilePhoneE164) {
      return {
        authUserId: user.id,
        state: "VERIFIED",
        profilePhone,
        profilePhoneE164,
        targetPhoneE164: profilePhoneE164,
        challengeId: null,
      };
    }

    const conflict = await this.repository.hasOperationalConflict(user.id, profilePhoneE164);
    return {
      authUserId: user.id,
      state: conflict ? "CONFLICT" : "PHONE_VERIFICATION_REQUIRED",
      profilePhone,
      profilePhoneE164,
      targetPhoneE164: profilePhoneE164,
      challengeId: null,
    };
  }
}

import { timingSafeEqual } from "node:crypto";

import { canonicalMoldovaE164 } from "@/src/modules/final-customer-auth/auth-phone";

import type { BusinessPhoneEnrollmentAuthGateway, BusinessPhoneEnrollmentRepository } from "./enrollment.repository";
import type { BusinessProfilePhoneStateService } from "./profile-phone-state";
import type { BusinessPhoneEnrollmentPublicState } from "./enrollment.types";

export class BusinessPhoneEnrollmentService {
  constructor(
    private readonly repository: BusinessPhoneEnrollmentRepository,
    private readonly auth: BusinessPhoneEnrollmentAuthGateway,
    private readonly hashPhone: (phoneE164: string) => string,
    private readonly profilePhoneState: BusinessProfilePhoneStateService,
  ) {}

  async start(): Promise<BusinessPhoneEnrollmentPublicState> {
    const target = await this.resolveTarget();
    if (!target.ok) return target.state;
    const { authUserId, phoneE164 } = target;
    const phoneKeyHash = this.hashPhone(phoneE164);

    try {
      const preparation = await this.repository.prepare({ authUserId, phoneE164, phoneKeyHash });
      if (preparation.result === "CONFLICT") return { ok: false, error: "PHONE_CONFLICT" };
      if (preparation.result === "ALREADY_CONFIRMED") return { ok: true, step: "CONFIRMED" };
      if (!(await this.repository.reserveSend({ challengeId: preparation.challengeId, authUserId, phoneE164, phoneKeyHash }))) {
        return { ok: false, error: "RATE_LIMITED" };
      }
      let result: { authUserId: string };
      try {
        result = await this.auth.requestPhoneChange(phoneE164);
      } catch {
        await this.repository.fail({ challengeId: preparation.challengeId, authUserId, phoneKeyHash });
        return { ok: false, error: "UNAVAILABLE" };
      }
      if (!safeEqual(result.authUserId, authUserId)) {
        await this.repository.fail({ challengeId: preparation.challengeId, authUserId, phoneKeyHash });
        return { ok: false, error: "UNAVAILABLE" };
      }
      return { ok: true, step: "OTP", challengeId: preparation.challengeId, maskedPhone: maskPhone(phoneE164) };
    } catch (error) {
      return enrollmentError(error);
    }
  }

  async resend(challengeId: string): Promise<BusinessPhoneEnrollmentPublicState> {
    const prepared = await this.prepareExisting(challengeId);
    if (!prepared.ok) return prepared.state;
    try {
      if (!(await this.repository.reserveSend(prepared.input))) return { ok: false, error: "RATE_LIMITED" };
      await this.auth.resendPhoneChange(prepared.input.phoneE164);
      return { ok: true, step: "OTP", challengeId, maskedPhone: maskPhone(prepared.input.phoneE164) };
    } catch {
      return { ok: false, error: "UNAVAILABLE" };
    }
  }

  async verify(challengeId: string, rawToken: string): Promise<BusinessPhoneEnrollmentPublicState> {
    if (!/^\d{6}$/.test(rawToken)) return { ok: false, error: "INVALID_CODE" };
    const prepared = await this.prepareExisting(challengeId);
    if (!prepared.ok) return prepared.state;
    try {
      if (!(await this.repository.reserveVerification(prepared.input))) return { ok: false, error: "RATE_LIMITED" };
      const result = await this.auth.verifyPhoneChange(prepared.input.phoneE164, rawToken);
      if (
        !safeEqual(result.authUserId, prepared.input.authUserId)
        || !result.phone
        || canonicalMoldovaE164(result.phone) !== prepared.input.phoneE164
        || !result.phoneConfirmed
      ) {
        await this.repository.fail(prepared.input);
        return { ok: false, error: "UNAVAILABLE" };
      }
      if (!(await this.repository.complete(prepared.input))) return { ok: false, error: "EXPIRED" };
      return { ok: true, step: "CONFIRMED" };
    } catch {
      return { ok: false, error: "INVALID_CODE" };
    }
  }

  private async prepareExisting(challengeId: string): Promise<
    | { ok: true; input: { challengeId: string; authUserId: string; phoneE164: string; phoneKeyHash: string } }
    | { ok: false; state: BusinessPhoneEnrollmentPublicState }
  > {
    if (!isUuid(challengeId)) return { ok: false, state: { ok: false, error: "EXPIRED" } };
    const target = await this.resolveTarget();
    if (!target.ok) return target;
    return {
      ok: true,
      input: {
        challengeId,
        authUserId: target.authUserId,
        phoneE164: target.phoneE164,
        phoneKeyHash: this.hashPhone(target.phoneE164),
      },
    };
  }

  private async resolveTarget(): Promise<
    | { ok: true; authUserId: string; phoneE164: string }
    | { ok: false; state: BusinessPhoneEnrollmentPublicState }
  > {
    try {
      const state = await this.profilePhoneState.resolveCurrent();
      if (!state) return { ok: false, state: { ok: false, error: "AUTH_REQUIRED" } };
      if (state.state === "VERIFIED") {
        return { ok: false, state: { ok: true, step: "CONFIRMED" } };
      }
      if (state.state === "CONFLICT") {
        return { ok: false, state: { ok: false, error: "PHONE_CONFLICT" } };
      }
      if (state.state !== "VERIFICATION_REQUIRED" || !state.profilePhoneE164) {
        return { ok: false, state: { ok: false, error: "INVALID_PHONE" } };
      }
      return { ok: true, authUserId: state.authUserId, phoneE164: state.profilePhoneE164 };
    } catch {
      return { ok: false, state: { ok: false, error: "UNAVAILABLE" } };
    }
  }
}

function enrollmentError(error: unknown): BusinessPhoneEnrollmentPublicState {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("business_phone_enrollment_not_eligible")) return { ok: false, error: "NOT_ELIGIBLE" };
  if (message.includes("business_phone_enrollment_auth_required")) return { ok: false, error: "AUTH_REQUIRED" };
  return { ok: false, error: "UNAVAILABLE" };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function maskPhone(phoneE164: string) {
  return `+373 ** *** ${phoneE164.slice(-2)}`;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

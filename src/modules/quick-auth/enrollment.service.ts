import { timingSafeEqual } from "node:crypto";

import { canonicalMoldovaE164 } from "@/src/modules/final-customer-auth/auth-phone";

import type { BusinessPhoneEnrollmentAuthGateway, BusinessPhoneEnrollmentRepository } from "./enrollment.repository";
import { BusinessPhoneAuthError } from "./enrollment.errors";
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
      const sendReservation = await this.repository.reserveSend({ challengeId: preparation.challengeId, authUserId, phoneE164, phoneKeyHash });
      if (!sendReservation.allowed) {
        return { ok: false, error: "RATE_LIMITED", retryAfterSeconds: sendReservation.retryAfterSeconds };
      }
      let result: { authUserId: string };
      try {
        result = await this.auth.requestPhoneVerification(phoneE164);
      } catch (error) {
        await this.repository.fail({
          challengeId: preparation.challengeId,
          authUserId,
          phoneKeyHash,
          failureStage: "AUTH_CHALLENGE_CREATE",
          safeErrorCode: safeAuthError(error),
        });
        return { ok: false, error: "PROVIDER_TEMPORARY" };
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
      const sendReservation = await this.repository.reserveSend(prepared.input);
      if (!sendReservation.allowed) {
        return { ok: false, error: "RATE_LIMITED", retryAfterSeconds: sendReservation.retryAfterSeconds };
      }
      await this.auth.resendPhoneVerification(prepared.input.phoneE164);
      return { ok: true, step: "OTP", challengeId, maskedPhone: maskPhone(prepared.input.phoneE164) };
    } catch (error) {
      await this.repository.fail({
        ...prepared.input,
        failureStage: "AUTH_RESEND",
        safeErrorCode: safeAuthError(error),
      });
      return { ok: false, error: "PROVIDER_TEMPORARY" };
    }
  }

  async verify(challengeId: string, rawToken: string): Promise<BusinessPhoneEnrollmentPublicState> {
    if (!/^\d{6}$/.test(rawToken)) return { ok: false, error: "INVALID_CODE" };
    const prepared = await this.prepareExisting(challengeId);
    if (!prepared.ok) return prepared.state;
    const challengeInput = {
      challengeId: prepared.input.challengeId,
      authUserId: prepared.input.authUserId,
      phoneE164: prepared.input.phoneE164,
      phoneKeyHash: prepared.input.phoneKeyHash,
    };
    try {
      if (!(await this.repository.reserveVerification(challengeInput))) return { ok: false, error: "RATE_LIMITED" };
      const result = await this.auth.verifyPhoneVerification(prepared.input.phoneE164, rawToken);
      if (
        !safeEqual(result.authUserId, prepared.input.authUserId)
        || !result.phone
        || canonicalMoldovaE164(result.phone) !== prepared.input.phoneE164
        || !result.phoneConfirmed
      ) {
        await this.repository.fail(challengeInput);
        await this.recordVerification(challengeInput, "FAILED", "IDENTITY_MISMATCH");
        return { ok: false, error: "UNAVAILABLE" };
      }
      if (!(await this.repository.complete(challengeInput))) {
        await this.recordVerification(challengeInput, "FAILED", "CHALLENGE_EXPIRED");
        return { ok: false, error: "EXPIRED" };
      }
      await this.recordVerification(challengeInput, "VERIFIED", null);
      return { ok: true, step: "CONFIRMED" };
    } catch (error) {
      await this.repository.fail({
        ...challengeInput,
        failureStage: "VERIFICATION",
        safeErrorCode: safeAuthError(error),
      });
      await this.recordVerification(challengeInput, "FAILED", "INVALID_OR_EXPIRED_CODE");
      return { ok: false, error: "INVALID_CODE" };
    }
  }

  private async prepareExisting(challengeId: string): Promise<
    | { ok: true; input: { challengeId: string; authUserId: string; phoneE164: string; phoneKeyHash: string; isPhoneChange: boolean } }
    | { ok: false; state: BusinessPhoneEnrollmentPublicState }
  > {
    if (!isUuid(challengeId)) return { ok: false, state: { ok: false, error: "EXPIRED" } };
    const target = await this.resolveTarget();
    if (!target.ok) return target;
    const preparation = await this.repository.prepare({
      authUserId: target.authUserId,
      phoneE164: target.phoneE164,
      phoneKeyHash: this.hashPhone(target.phoneE164),
    });
    if (preparation.result !== "READY" || preparation.challengeId !== challengeId) {
      return { ok: false, state: { ok: false, error: "EXPIRED" } };
    }
    return {
      ok: true,
      input: {
        challengeId,
        authUserId: target.authUserId,
        phoneE164: target.phoneE164,
        phoneKeyHash: this.hashPhone(target.phoneE164),
        isPhoneChange: preparation.isPhoneChange,
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

  private async recordVerification(
    input: { challengeId: string; authUserId: string; phoneKeyHash: string },
    state: "VERIFIED" | "FAILED",
    safeErrorCode: string | null,
  ) {
    try {
      await this.repository.recordVerification({
        challengeId: input.challengeId,
        authUserId: input.authUserId,
        phoneKeyHash: input.phoneKeyHash,
        state,
        safeErrorCode,
      });
    } catch {
      // Verification/promotion remains authoritative; diagnostics cannot undo it.
    }
  }
}

function safeAuthError(error: unknown) {
  return error instanceof BusinessPhoneAuthError ? error.safeCode : "AUTH_UNKNOWN";
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

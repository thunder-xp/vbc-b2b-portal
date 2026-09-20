import { timingSafeEqual } from "node:crypto";

import { canonicalMoldovaE164 } from "@/src/modules/final-customer-auth/auth-phone";

import type { QuickAuthOtpGateway, QuickAuthRepository } from "./repository";
import type { QuickAuthChallenge, QuickAuthPublicState } from "./types";

export class QuickAuthInputError extends Error {}
export class QuickAuthRateLimitError extends Error {}

export class QuickAuthResolver {
  constructor(
    private readonly repository: QuickAuthRepository,
    private readonly otp: QuickAuthOtpGateway,
    private readonly hashPhone: (phoneE164: string) => string,
    private readonly businessPhoneOtpEnabled = false,
  ) {}

  async start(rawPhone: string, requesterKeyHash: string): Promise<QuickAuthPublicState> {
    const phoneE164 = canonicalMoldovaE164(rawPhone);
    if (!phoneE164) return { ok: false, error: "INVALID_PHONE" };

    try {
      const phoneKeyHash = this.hashPhone(phoneE164);
      const challenge = await this.repository.start({
        phoneE164,
        phoneKeyHash,
        requesterKeyHash,
        businessPhoneOtpEnabled: this.businessPhoneOtpEnabled,
      });

      if (challenge.resolution === "CUSTOMER_OTP") {
        return this.sendOtp(challenge.challengeId, phoneE164, challenge.maskedPhone, phoneKeyHash);
      }
      if (challenge.resolution === "MULTIPLE_CONTEXT_EDGE_CASE") {
        return this.sendOtp(challenge.challengeId, phoneE164, challenge.maskedPhone, phoneKeyHash);
      }
      if (challenge.resolution === "BUSINESS_EMAIL_REQUIRED") {
        return { ok: true, step: "EMAIL", challengeId: challenge.challengeId, maskedPhone: challenge.maskedPhone };
      }
      if (challenge.resolution === "NOT_REGISTERED") return { ok: true, step: "NOT_REGISTERED" };
      return { ok: true, step: "BLOCKED" };
    } catch (error) {
      if (error instanceof QuickAuthRateLimitError) return { ok: false, error: "RATE_LIMITED" };
      return { ok: false, error: "UNAVAILABLE" };
    }
  }

  async submitBusinessEmail(challengeId: string, rawPhone: string, rawEmail: string): Promise<QuickAuthPublicState> {
    const email = rawEmail.trim().toLowerCase();
    if (!isEmail(email)) return { ok: false, error: "INVALID_EMAIL" };
    const verified = await this.readChallenge(challengeId, rawPhone, ["BUSINESS_EMAIL_REQUIRED"]);
    if (!verified.ok) return verified.state;

    if (!(await this.repository.reserveBusinessEmailAttempt(challengeId, verified.phoneKeyHash))) {
      return { ok: false, error: "RATE_LIMITED" };
    }
    const expectedEmail = verified.challenge.subjectAuthUserId
      ? await this.repository.getAuthUserEmail(verified.challenge.subjectAuthUserId)
      : null;
    if (!expectedEmail || !safeEqual(email, expectedEmail.trim().toLowerCase())) {
      return { ok: false, error: "IDENTITY_MISMATCH" };
    }
    if (!(await this.repository.confirmBusinessEmail(challengeId, verified.phoneKeyHash))) {
      return { ok: false, error: "EXPIRED" };
    }
    return this.sendOtp(challengeId, verified.phoneE164, verified.maskedPhone, verified.phoneKeyHash);
  }

  async resend(challengeId: string, rawPhone: string): Promise<QuickAuthPublicState> {
    const verified = await this.readChallenge(
      challengeId,
      rawPhone,
      ["CUSTOMER_OTP", "BUSINESS_EMAIL_REQUIRED", "MULTIPLE_CONTEXT_EDGE_CASE"],
      true,
    );
    if (!verified.ok) return verified.state;
    return this.sendOtp(challengeId, verified.phoneE164, verified.maskedPhone, verified.phoneKeyHash);
  }

  async verify(challengeId: string, rawPhone: string, rawToken: string): Promise<QuickAuthPublicState> {
    if (!/^\d{6}$/.test(rawToken)) return { ok: false, error: "INVALID_CODE" };
    const verified = await this.readChallenge(
      challengeId,
      rawPhone,
      ["CUSTOMER_OTP", "BUSINESS_EMAIL_REQUIRED", "MULTIPLE_CONTEXT_EDGE_CASE"],
      true,
    );
    if (!verified.ok) return verified.state;

    try {
      if (!(await this.repository.reserveOtpVerification(challengeId, verified.phoneKeyHash))) {
        return { ok: false, error: "RATE_LIMITED" };
      }
      const result = await this.otp.verify(verified.phoneE164, rawToken);
      if (!verified.challenge.subjectAuthUserId || !safeEqual(result.authUserId, verified.challenge.subjectAuthUserId)) {
        await this.otp.signOut();
        await this.repository.setStatus(challengeId, verified.phoneKeyHash, "FAILED");
        return { ok: false, error: "UNAVAILABLE" };
      }
      if (!(await this.repository.setStatus(challengeId, verified.phoneKeyHash, "VERIFIED"))) {
        await this.otp.signOut();
        return { ok: false, error: "EXPIRED" };
      }
      return { ok: true, step: "OTP", challengeId, maskedPhone: verified.maskedPhone };
    } catch {
      return { ok: false, error: "INVALID_CODE" };
    }
  }

  private async sendOtp(challengeId: string, phoneE164: string, maskedPhone: string, phoneKeyHash: string): Promise<QuickAuthPublicState> {
    try {
      if (!(await this.repository.reserveOtpSend(challengeId, phoneKeyHash))) {
        return { ok: false, error: "RATE_LIMITED" };
      }
      await this.otp.send(phoneE164);
      return { ok: true, step: "OTP", challengeId, maskedPhone };
    } catch {
      await this.repository.setStatus(challengeId, phoneKeyHash, "FAILED");
      return { ok: false, error: "UNAVAILABLE" };
    }
  }

  private async readChallenge(
    challengeId: string,
    rawPhone: string,
    allowedResolutions: readonly QuickAuthChallenge["resolution"][],
    requireOtpSent = false,
  ): Promise<
    | { ok: true; challenge: QuickAuthChallenge; phoneE164: string; phoneKeyHash: string; maskedPhone: string }
    | { ok: false; state: QuickAuthPublicState }
  > {
    const phoneE164 = canonicalMoldovaE164(rawPhone);
    if (!phoneE164 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(challengeId)) {
      return { ok: false, state: { ok: false, error: "EXPIRED" } };
    }
    const phoneKeyHash = this.hashPhone(phoneE164);
    const challenge = await this.repository.read(challengeId, phoneKeyHash);
    if (!challenge || !allowedResolutions.includes(challenge.resolution)) {
      return { ok: false, state: { ok: false, error: "EXPIRED" } };
    }
    if (requireOtpSent && challenge.status !== "OTP_SENT") {
      return { ok: false, state: { ok: false, error: "EXPIRED" } };
    }
    return { ok: true, challenge, phoneE164, phoneKeyHash, maskedPhone: maskPhone(phoneE164) };
  }
}

function isEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function maskPhone(phoneE164: string) {
  return `+373 ** *** ${phoneE164.slice(-2)}`;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

import "server-only";

import { z } from "zod";

import {
  SmtpEmailProvider,
  SmtpEmailProviderError,
  type SmtpEmailProvider as SmtpProvider,
} from "@/src/lib/email/smtp-email-provider";
import { buildGeneratedSignupEmail } from "@/src/modules/auth/auth-email-hook.service";
import { registrationEmailRedirectUrl } from "@/src/modules/auth/registration.server";
import { professionalRegistrationContinuation } from "@/src/modules/auth/redirects";

import type {
  AuthEmailRecoveryAttempt,
  AuthEmailRecoveryRepository,
} from "../repositories";
import { SupabaseAuthEmailRecoveryRepository } from "../repositories";

const UUID = z.string().uuid();
const BASIC_EMAIL = z.string().trim().max(254).refine((value) => /^[^\s@]+@[^\s@]+$/.test(value));

export type AuthEmailRecoveryDiagnosis = Readonly<{
  identityState: "UNKNOWN" | "AMBIGUOUS" | "UNCONFIRMED" | "CONFIRMED";
  authUserId: string | null;
  maskedEmail: string;
  emailDomain: string;
  originalErrorCode: "email_address_invalid";
  profileState: "NOT_STARTED" | "PRESENT";
  profileStatus: string | null;
  latestAttemptStatus: AuthEmailRecoveryAttempt["status"] | null;
  deliveryResult: string | null;
  verificationResult: AuthEmailRecoveryAttempt["verificationResult"] | null;
  eligible: boolean;
}>;

export type AuthEmailRecoveryExecutionResult = Readonly<{
  authUserId: string;
  correlationId: string;
  deliveryResult: "ACCEPTED";
  idempotent: boolean;
}>;

export type AuthEmailRecoveryErrorCode =
  | "INVALID_INPUT"
  | "EVIDENCE_REQUIRED"
  | "IDENTITY_UNKNOWN"
  | "IDENTITY_AMBIGUOUS"
  | "ALREADY_CONFIRMED"
  | "RATE_LIMITED"
  | "IN_PROGRESS"
  | "PREVIOUSLY_FAILED"
  | "GENERATION_FAILED"
  | "DELIVERY_FAILED"
  | "AUDIT_FAILED_AFTER_DELIVERY"
  | "SYSTEM_ERROR";

export class AuthEmailRecoveryError extends Error {
  constructor(readonly code: AuthEmailRecoveryErrorCode) {
    super(code);
    this.name = "AuthEmailRecoveryError";
  }
}

export class AuthEmailRecoveryService {
  constructor(
    private readonly repository: AuthEmailRecoveryRepository,
    private readonly provider: Pick<SmtpProvider, "send">,
  ) {}

  async diagnose(emailInput: string): Promise<AuthEmailRecoveryDiagnosis> {
    const parsed = BASIC_EMAIL.safeParse(emailInput.trim().toLowerCase());
    if (!parsed.success) throw new AuthEmailRecoveryError("INVALID_INPUT");
    const email = parsed.data;
    const { maskedEmail, emailDomain } = redactEmail(email);
    let identities;
    try {
      identities = await this.repository.findExactAuthUsers(email);
    } catch {
      throw new AuthEmailRecoveryError("SYSTEM_ERROR");
    }
    if (identities.length === 0) return emptyDiagnosis("UNKNOWN", maskedEmail, emailDomain);
    if (identities.length !== 1) return emptyDiagnosis("AMBIGUOUS", maskedEmail, emailDomain);

    const identity = identities[0]!;
    let profile;
    let latestAttempt;
    try {
      [profile, latestAttempt] = await Promise.all([
        this.repository.getProfileState(identity.id),
        this.repository.getLatestAttempt(identity.id),
      ]);
      if (identity.emailConfirmedAt && latestAttempt?.status === "DELIVERY_ACCEPTED") {
        await this.repository.recordOutcome({
          attemptId: latestAttempt.id,
          correlationId: latestAttempt.correlationId,
          outcome: "VERIFICATION_ACCEPTED",
        });
        latestAttempt = {
          ...latestAttempt,
          status: "VERIFIED" as const,
          verificationResult: "ACCEPTED" as const,
        };
      }
    } catch {
      throw new AuthEmailRecoveryError("SYSTEM_ERROR");
    }

    const identityState = identity.emailConfirmedAt ? "CONFIRMED" : "UNCONFIRMED";
    const blockedByAttempt = latestAttempt
      ? ["RESERVED", "GENERATED", "DELIVERY_ACCEPTED", "VERIFIED"].includes(latestAttempt.status)
      : false;
    return {
      identityState,
      authUserId: identity.id,
      maskedEmail,
      emailDomain,
      originalErrorCode: "email_address_invalid",
      profileState: profile.exists ? "PRESENT" : "NOT_STARTED",
      profileStatus: profile.status,
      latestAttemptStatus: latestAttempt?.status ?? null,
      deliveryResult: latestAttempt?.deliveryResult ?? null,
      verificationResult: latestAttempt?.verificationResult ?? null,
      eligible: identityState === "UNCONFIRMED" && !blockedByAttempt,
    };
  }

  async execute(input: Readonly<{
    actorUserId: string;
    authUserId: string;
    correlationId: string;
    originalErrorConfirmed: boolean;
    mailboxValidityConfirmed: boolean;
    explicitlyAuthorized: boolean;
  }>): Promise<AuthEmailRecoveryExecutionResult> {
    if (!UUID.safeParse(input.actorUserId).success
      || !UUID.safeParse(input.authUserId).success
      || !UUID.safeParse(input.correlationId).success) {
      throw new AuthEmailRecoveryError("INVALID_INPUT");
    }
    if (!input.originalErrorConfirmed || !input.mailboxValidityConfirmed || !input.explicitlyAuthorized) {
      throw new AuthEmailRecoveryError("EVIDENCE_REQUIRED");
    }

    const identity = await this.getUnambiguousUnconfirmedIdentity(input.authUserId);
    const { maskedEmail, emailDomain } = redactEmail(identity.email);
    let reservation;
    try {
      reservation = await this.repository.reserveAttempt({
        authUserId: identity.id,
        actorUserId: input.actorUserId,
        maskedEmail,
        emailDomain,
        correlationId: input.correlationId,
        originalErrorCode: "email_address_invalid",
      });
    } catch {
      throw new AuthEmailRecoveryError("SYSTEM_ERROR");
    }
    if (reservation.outcome === "ALREADY_DELIVERED" && reservation.attemptId) {
      return { authUserId: identity.id, correlationId: input.correlationId, deliveryResult: "ACCEPTED", idempotent: true };
    }
    if (reservation.outcome === "RATE_LIMITED") throw new AuthEmailRecoveryError("RATE_LIMITED");
    if (reservation.outcome === "IN_PROGRESS") throw new AuthEmailRecoveryError("IN_PROGRESS");
    if (reservation.outcome === "PREVIOUSLY_FAILED") throw new AuthEmailRecoveryError("PREVIOUSLY_FAILED");
    if (!reservation.attemptId) throw new AuthEmailRecoveryError("SYSTEM_ERROR");

    const nextPath = professionalRegistrationContinuation(identity.registrationIntent, identity.locale);
    const redirectTo = registrationEmailRedirectUrl(identity.registrationIntent, identity.locale, nextPath);
    let generated;
    try {
      generated = await this.repository.generateSignupLink({ email: identity.email, redirectTo });
      const exactAfterGeneration = await this.repository.findExactAuthUsers(identity.email);
      if (generated.userId !== identity.id
        || exactAfterGeneration.length !== 1
        || exactAfterGeneration[0]?.id !== identity.id) {
        throw new AuthEmailRecoveryError("IDENTITY_AMBIGUOUS");
      }
    } catch (error) {
      await this.recordFailure(reservation.attemptId, input.correlationId, "GENERATION_FAILED");
      if (error instanceof AuthEmailRecoveryError) throw error;
      throw new AuthEmailRecoveryError("GENERATION_FAILED");
    }

    let emailMessage;
    try {
      emailMessage = buildGeneratedSignupEmail({
        to: identity.email,
        locale: identity.locale,
        actionLink: generated.actionLink,
        emailOtp: generated.emailOtp,
        correlationId: input.correlationId,
      });
      await this.repository.recordOutcome({
        attemptId: reservation.attemptId,
        correlationId: input.correlationId,
        outcome: "LINK_GENERATED",
      });
    } catch {
      await this.recordFailure(reservation.attemptId, input.correlationId, "GENERATION_FAILED");
      throw new AuthEmailRecoveryError("GENERATION_FAILED");
    }

    try {
      await this.provider.send(emailMessage);
    } catch (error) {
      const deliveryResult = providerFailureResult(error);
      await this.recordFailure(reservation.attemptId, input.correlationId, deliveryResult);
      throw new AuthEmailRecoveryError("DELIVERY_FAILED");
    }

    try {
      await this.repository.recordOutcome({
        attemptId: reservation.attemptId,
        correlationId: input.correlationId,
        outcome: "DELIVERY_ACCEPTED",
      });
    } catch {
      // The GENERATED state deliberately blocks another send if SMTP accepted but
      // final audit persistence failed.
      throw new AuthEmailRecoveryError("AUDIT_FAILED_AFTER_DELIVERY");
    }

    return {
      authUserId: identity.id,
      correlationId: input.correlationId,
      deliveryResult: "ACCEPTED",
      idempotent: false,
    };
  }

  private async getUnambiguousUnconfirmedIdentity(authUserId: string) {
    let identity;
    try {
      identity = await this.repository.getAuthUserById(authUserId);
    } catch {
      throw new AuthEmailRecoveryError("SYSTEM_ERROR");
    }
    if (!identity) throw new AuthEmailRecoveryError("IDENTITY_UNKNOWN");
    if (identity.emailConfirmedAt) throw new AuthEmailRecoveryError("ALREADY_CONFIRMED");
    let matches;
    try {
      matches = await this.repository.findExactAuthUsers(identity.email);
    } catch {
      throw new AuthEmailRecoveryError("SYSTEM_ERROR");
    }
    if (matches.length === 0) throw new AuthEmailRecoveryError("IDENTITY_UNKNOWN");
    if (matches.length !== 1 || matches[0]?.id !== identity.id) {
      throw new AuthEmailRecoveryError("IDENTITY_AMBIGUOUS");
    }
    return identity;
  }

  private async recordFailure(attemptId: string, correlationId: string, deliveryResult: string) {
    try {
      await this.repository.recordOutcome({
        attemptId,
        correlationId,
        outcome: "DELIVERY_FAILED",
        deliveryResult,
      });
    } catch {
      // A RESERVED/GENERATED attempt remains non-repeatable if audit persistence fails.
    }
  }
}

function redactEmail(email: string): { maskedEmail: string; emailDomain: string } {
  const [local = "", domain = ""] = email.toLowerCase().split("@", 2);
  const visible = local.slice(0, Math.min(2, local.length));
  return { maskedEmail: `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`, emailDomain: domain };
}

function emptyDiagnosis(
  identityState: "UNKNOWN" | "AMBIGUOUS",
  maskedEmail: string,
  emailDomain: string,
): AuthEmailRecoveryDiagnosis {
  return {
    identityState,
    authUserId: null,
    maskedEmail,
    emailDomain,
    originalErrorCode: "email_address_invalid",
    profileState: "NOT_STARTED",
    profileStatus: null,
    latestAttemptStatus: null,
    deliveryResult: null,
    verificationResult: null,
    eligible: false,
  };
}

function providerFailureResult(error: unknown): string {
  if (!(error instanceof SmtpEmailProviderError)) return "PROVIDER_UNAVAILABLE";
  return {
    configuration: "PROVIDER_CONFIGURATION",
    timeout: "PROVIDER_TIMEOUT",
    authentication: "PROVIDER_AUTHENTICATION",
    rejected: "PROVIDER_REJECTED",
    unavailable: "PROVIDER_UNAVAILABLE",
  }[error.category];
}

const service = new AuthEmailRecoveryService(
  new SupabaseAuthEmailRecoveryRepository(),
  new SmtpEmailProvider({ timeoutMs: 10_000 }),
);

export function createAuthEmailRecoveryService(): AuthEmailRecoveryService {
  return service;
}

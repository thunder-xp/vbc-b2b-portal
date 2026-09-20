import "server-only";

import { createHash } from "node:crypto";

import { hashCustomerIdentityKey } from "@/src/modules/customer-identity/hmac";
import { createMoldcellSmsProvider } from "@/src/modules/notifications/gateway/moldcell-sms.provider";
import { NotificationDeliveryError } from "@/src/modules/notifications/gateway/types";

import { canonicalMoldovaE164 } from "./auth-phone";

export const AUTH_SMS_PURPOSE = "AUTH_OTP" as const;

export type AuthSmsMode = "DISABLED" | "SANDBOX" | "PRODUCTION";

export class AuthSmsDeliveryError extends Error {
  constructor(readonly code: "DISABLED" | "RECIPIENT_NOT_ALLOWED" | "RATE_LIMITED" | "DELIVERY_FAILED") {
    super("Authentication code delivery failed.");
    this.name = "AuthSmsDeliveryError";
  }
}

export interface AuthSmsRateLimitRepository {
  reserve(phoneKeyHash: string): Promise<boolean>;
}

export type GovernedBusinessAuthSmsIntent = "BUSINESS_PHONE_ENROLLMENT" | "BUSINESS_QUICK_AUTH";

export interface GovernedBusinessAuthSmsRepository {
  resolve(authUserId: string, phoneKeyHash: string): Promise<GovernedBusinessAuthSmsIntent | null>;
}

export type AuthSmsDeliveryRegistration = Readonly<{
  result: "DISPATCH" | "ALREADY_ACCEPTED" | "IN_PROGRESS" | "FAILED_FINAL" | "EXHAUSTED";
  isNew: boolean;
  attemptCount: number;
}>;

export type AuthSmsDeliveryCompletion = Readonly<{
  correlationId: string;
  deliveryState: "PROVIDER_ACCEPTED" | "FAILED_RETRYABLE" | "FAILED_FINAL";
  stage: "POLICY" | "RATE_LIMIT" | "SMS_PROVIDER_REQUEST" | "SMS_PROVIDER_RESULT";
  providerHttpStatus: number | null;
  providerCode: string | null;
  providerTimestamp: string | null;
  safeErrorCode: string | null;
  retryState: "NOT_REQUIRED" | "RETRYABLE" | "EXHAUSTED" | "PERMANENT";
}>;

export interface AuthSmsDeliveryAuditRepository {
  begin(input: Readonly<{
    correlationId: string;
    authUserId: string;
    phoneKeyHash: string;
    recipientSuffix: string;
    purpose: "PHONE_VERIFICATION" | "QUICK_AUTH" | "AUTH_OTP";
    intent: GovernedBusinessAuthSmsIntent | null;
    transport: "relay" | "direct";
  }>): Promise<AuthSmsDeliveryRegistration>;
  startProviderAttempt(correlationId: string): Promise<number>;
  complete(input: AuthSmsDeliveryCompletion): Promise<void>;
}

export type AuthSmsDeliveryResult = Readonly<{
  purpose: typeof AUTH_SMS_PURPOSE;
  provider: "moldcell";
  transport: "relay" | "direct";
  accepted: true;
  correlationId: string;
}>;

export class FinalCustomerAuthSmsService {
  constructor(
    private readonly rateLimits: AuthSmsRateLimitRepository,
    private readonly environment: Readonly<Record<string, string | undefined>> = process.env,
    private readonly fetchImplementation: typeof fetch = fetch,
    private readonly governedBusinessAuth: GovernedBusinessAuthSmsRepository = denyGovernedBusinessAuth,
    private readonly audit: AuthSmsDeliveryAuditRepository = noOpAuthSmsDeliveryAudit,
  ) {}

  async send(input: Readonly<{ authUserId: string; webhookId: string; phone: string; otp: string }>): Promise<AuthSmsDeliveryResult> {
    const phone = canonicalMoldovaE164(input.phone);
    if (!phone) {
      throw new AuthSmsDeliveryError("RECIPIENT_NOT_ALLOWED");
    }
    if (!/^\d{6}$/.test(input.otp)) throw new AuthSmsDeliveryError("DELIVERY_FAILED");
    const phoneKey = hashCustomerIdentityKey("PHONE", phone, true);
    const policy = readAuthSmsPolicy(this.environment);
    const governedIntent = policy.enabled && policy.mode !== "DISABLED"
      ? await this.governedBusinessAuth.resolve(input.authUserId, phoneKey.keyHash)
      : null;
    const requestHash = createHash("sha256").update(`auth-otp:${input.webhookId}`, "utf8").digest("hex");
    const correlationId = deterministicUuid(requestHash);
    const transport = this.environment.MOLDCELL_TRANSPORT_MODE?.toLowerCase() === "direct" ? "direct" : "relay";
    const registration = await this.audit.begin({
      correlationId,
      authUserId: input.authUserId,
      phoneKeyHash: phoneKey.keyHash,
      recipientSuffix: phone.slice(-3),
      purpose: governedIntent === "BUSINESS_PHONE_ENROLLMENT"
        ? "PHONE_VERIFICATION"
        : governedIntent === "BUSINESS_QUICK_AUTH" ? "QUICK_AUTH" : "AUTH_OTP",
      intent: governedIntent,
      transport,
    });
    if (registration.result === "ALREADY_ACCEPTED") {
      return { purpose: AUTH_SMS_PURPOSE, provider: "moldcell", transport, accepted: true, correlationId };
    }
    if (registration.result !== "DISPATCH") throw new AuthSmsDeliveryError("DELIVERY_FAILED");

    if (!policy.enabled || policy.mode === "DISABLED") {
      await this.audit.complete(failure(correlationId, "POLICY", "AUTH_SMS_DISABLED", false));
      throw new AuthSmsDeliveryError("DISABLED");
    }
    if (policy.mode === "SANDBOX" && !policy.sandboxRecipients.has(phone) && !governedIntent) {
      await this.audit.complete(failure(correlationId, "POLICY", "RECIPIENT_NOT_ALLOWED", false));
      throw new AuthSmsDeliveryError("RECIPIENT_NOT_ALLOWED");
    }

    if (registration.isNew && !(await this.rateLimits.reserve(phoneKey.keyHash))) {
      await this.audit.complete(failure(correlationId, "RATE_LIMIT", "RATE_LIMITED", false));
      throw new AuthSmsDeliveryError("RATE_LIMITED");
    }

    const provider = createMoldcellSmsProvider(this.environment, this.fetchImplementation);
    const maxAttemptsThisRequest = Math.min(2, 3 - registration.attemptCount);
    for (let index = 0; index < maxAttemptsThisRequest; index += 1) {
      await this.audit.startProviderAttempt(correlationId);
      try {
        const result = await provider.send({
          deliveryId: correlationId,
          recipient: phone,
          message: governedIntent === "BUSINESS_PHONE_ENROLLMENT"
            ? `Код подтверждения телефона NSD: ${input.otp}`
            : `Код входа NSD: ${input.otp}`,
          locale: "ru",
          idempotencyKey: `auth-otp:${requestHash.slice(0, 48)}`,
        });
        if (!result.accepted) {
          await this.audit.complete({
            correlationId,
            deliveryState: "FAILED_FINAL",
            stage: "SMS_PROVIDER_RESULT",
            providerHttpStatus: result.providerHttpStatus ?? null,
            providerCode: result.providerCode,
            providerTimestamp: result.providerTimestamp,
            safeErrorCode: result.failureCategory ?? "PROVIDER_REJECTED",
            retryState: "PERMANENT",
          });
          throw new AuthSmsDeliveryError("DELIVERY_FAILED");
        }
        await this.audit.complete({
          correlationId,
          deliveryState: "PROVIDER_ACCEPTED",
          stage: "SMS_PROVIDER_RESULT",
          providerHttpStatus: result.providerHttpStatus ?? null,
          providerCode: result.providerCode,
          providerTimestamp: result.providerTimestamp,
          safeErrorCode: null,
          retryState: "NOT_REQUIRED",
        });
        return { purpose: AUTH_SMS_PURPOSE, provider: "moldcell", transport, accepted: true, correlationId };
      } catch (error) {
        if (error instanceof AuthSmsDeliveryError) throw error;
        const deliveryError = error instanceof NotificationDeliveryError ? error : null;
        const retryable = deliveryError?.retryable === true;
        const exhausted = index + 1 >= maxAttemptsThisRequest;
        await this.audit.complete({
          correlationId,
          deliveryState: retryable ? "FAILED_RETRYABLE" : "FAILED_FINAL",
          stage: "SMS_PROVIDER_REQUEST",
          providerHttpStatus: deliveryError?.providerHttpStatus ?? null,
          providerCode: deliveryError?.providerCode ?? null,
          providerTimestamp: deliveryError?.providerTimestamp ?? null,
          safeErrorCode: deliveryError?.category ?? "UNKNOWN_PROVIDER_FAILURE",
          retryState: retryable ? (exhausted ? "EXHAUSTED" : "RETRYABLE") : "PERMANENT",
        });
        if (!retryable || exhausted) throw new AuthSmsDeliveryError("DELIVERY_FAILED");
      }
    }
    throw new AuthSmsDeliveryError("DELIVERY_FAILED");
  }
}

const denyGovernedBusinessAuth: GovernedBusinessAuthSmsRepository = {
  resolve: async () => null,
};

const noOpAuthSmsDeliveryAudit: AuthSmsDeliveryAuditRepository = {
  begin: async () => ({ result: "DISPATCH", isNew: true, attemptCount: 0 }),
  startProviderAttempt: async () => 1,
  complete: async () => undefined,
};

function failure(
  correlationId: string,
  stage: AuthSmsDeliveryCompletion["stage"],
  safeErrorCode: string,
  retryable: boolean,
): AuthSmsDeliveryCompletion {
  return {
    correlationId,
    deliveryState: retryable ? "FAILED_RETRYABLE" : "FAILED_FINAL",
    stage,
    providerHttpStatus: null,
    providerCode: null,
    providerTimestamp: null,
    safeErrorCode,
    retryState: retryable ? "RETRYABLE" : "PERMANENT",
  };
}

export function readAuthSmsPolicy(environment: Readonly<Record<string, string | undefined>> = process.env) {
  const rawMode = environment.AUTH_SMS_MODE?.trim().toUpperCase();
  const mode: AuthSmsMode = rawMode === "SANDBOX" || rawMode === "PRODUCTION" ? rawMode : "DISABLED";
  const sandboxRecipients = new Set(
    (environment.SMS_SANDBOX_ALLOWED_RECIPIENTS ?? "")
      .split(",")
      .map((value) => canonicalMoldovaE164(value))
      .filter((value): value is string => Boolean(value)),
  );
  return Object.freeze({
    enabled: environment.AUTH_SMS_ENABLED?.trim().toLowerCase() === "true",
    mode,
    sandboxRecipients,
  });
}

function deterministicUuid(hash: string): string {
  const chars = hash.slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = "8";
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

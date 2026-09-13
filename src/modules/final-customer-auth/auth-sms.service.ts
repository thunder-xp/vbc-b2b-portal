import "server-only";

import { createHash } from "node:crypto";

import { hashCustomerIdentityKey } from "@/src/modules/customer-identity/hmac";
import { createMoldcellSmsProvider } from "@/src/modules/notifications/gateway/moldcell-sms.provider";

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
  ) {}

  async send(input: Readonly<{ webhookId: string; phone: string; otp: string }>): Promise<AuthSmsDeliveryResult> {
    const policy = readAuthSmsPolicy(this.environment);
    if (!policy.enabled || policy.mode === "DISABLED") throw new AuthSmsDeliveryError("DISABLED");

    const phone = canonicalMoldovaE164(input.phone);
    if (!phone) {
      throw new AuthSmsDeliveryError("RECIPIENT_NOT_ALLOWED");
    }
    if (!/^\d{6}$/.test(input.otp)) throw new AuthSmsDeliveryError("DELIVERY_FAILED");
    if (policy.mode === "SANDBOX" && !policy.sandboxRecipients.has(phone)) {
      throw new AuthSmsDeliveryError("RECIPIENT_NOT_ALLOWED");
    }

    const phoneKey = hashCustomerIdentityKey("PHONE", phone, true);
    if (!(await this.rateLimits.reserve(phoneKey.keyHash))) {
      throw new AuthSmsDeliveryError("RATE_LIMITED");
    }

    const requestHash = createHash("sha256").update(`auth-otp:${input.webhookId}`, "utf8").digest("hex");
    const correlationId = deterministicUuid(requestHash);
    try {
      const result = await createMoldcellSmsProvider(this.environment, this.fetchImplementation).send({
        deliveryId: correlationId,
        recipient: phone,
        message: `Код входа NSD: ${input.otp}`,
        locale: "ru",
        idempotencyKey: `auth-otp:${requestHash.slice(0, 48)}`,
      });
      if (!result.accepted) throw new AuthSmsDeliveryError("DELIVERY_FAILED");
    } catch (error) {
      if (error instanceof AuthSmsDeliveryError) throw error;
      throw new AuthSmsDeliveryError("DELIVERY_FAILED");
    }

    return {
      purpose: AUTH_SMS_PURPOSE,
      provider: "moldcell",
      transport: this.environment.MOLDCELL_TRANSPORT_MODE?.toLowerCase() === "direct" ? "direct" : "relay",
      accepted: true,
      correlationId,
    };
  }
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

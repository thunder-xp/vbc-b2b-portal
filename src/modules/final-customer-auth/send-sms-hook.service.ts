import "server-only";

import { Webhook } from "standardwebhooks";
import { z } from "zod";

import { FinalCustomerAuthSmsService } from "./auth-sms.service";
import { SupabaseGovernedBusinessAuthSmsRepository } from "./governed-business-auth-sms.repository";
import { SupabaseAuthSmsRateLimitRepository } from "./supabase-rate-limit.repository";

const sendSmsPayloadSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    phone: z.string(),
  }).passthrough(),
  sms: z.object({
    otp: z.string().regex(/^\d{6}$/),
  }).passthrough(),
}).passthrough();

export class SendSmsHookVerificationError extends Error {
  constructor(readonly code: "SIGNATURE_INVALID" | "PAYLOAD_INVALID" | "CONFIGURATION_INVALID") {
    super("Send SMS hook request rejected.");
    this.name = "SendSmsHookVerificationError";
  }
}

export async function handleSupabaseSendSmsHook(
  rawPayload: string,
  headers: Headers,
  options: Readonly<{
    environment?: Readonly<Record<string, string | undefined>>;
    service?: Pick<FinalCustomerAuthSmsService, "send">;
  }> = {},
) {
  const environment = options.environment ?? process.env;
  const secrets = readHookSecrets(environment.SUPABASE_SEND_SMS_HOOK_SECRET);
  if (secrets.length === 0) throw new SendSmsHookVerificationError("CONFIGURATION_INVALID");

  let verified: unknown = null;
  for (const secret of secrets) {
    try {
      verified = new Webhook(secret).verify(rawPayload, Object.fromEntries(headers));
      break;
    } catch {
      // Rotation is a bounded list; try the next configured secret.
    }
  }
  if (verified === null) throw new SendSmsHookVerificationError("SIGNATURE_INVALID");

  const parsed = sendSmsPayloadSchema.safeParse(verified);
  if (!parsed.success) throw new SendSmsHookVerificationError("PAYLOAD_INVALID");

  const webhookId = headers.get("webhook-id");
  if (!webhookId || webhookId.length > 200) throw new SendSmsHookVerificationError("SIGNATURE_INVALID");
  const service = options.service ?? new FinalCustomerAuthSmsService(
    new SupabaseAuthSmsRateLimitRepository(),
    environment,
    fetch,
    new SupabaseGovernedBusinessAuthSmsRepository(),
  );
  return service.send({
    authUserId: parsed.data.user.id,
    webhookId,
    phone: parsed.data.user.phone,
    otp: parsed.data.sms.otp,
  });
}

function readHookSecrets(value: string | undefined): string[] {
  return (value ?? "")
    .split("|")
    .map((secret) => secret.trim().replace(/^v1,/, ""))
    .filter((secret) => /^whsec_[A-Za-z0-9+/=_-]{20,}$/.test(secret));
}

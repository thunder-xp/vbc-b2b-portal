import "server-only";

import { createHmac } from "node:crypto";

import { getCustomerIdentityHashingEnv } from "@/src/lib/env";
import { hashCustomerIdentityKey } from "@/src/modules/customer-identity/hmac";

import { QuickAuthResolver } from "./service";
import { SupabaseQuickAuthOtpGateway, SupabaseQuickAuthRepository } from "./supabase.repository";

export function createQuickAuthResolver() {
  return new QuickAuthResolver(
    new SupabaseQuickAuthRepository(),
    new SupabaseQuickAuthOtpGateway(),
    (phone) => hashCustomerIdentityKey("PHONE", phone, true).keyHash,
    isBusinessPhoneOtpEnabled(),
  );
}

export function quickAuthRequesterHash(requestIdentity: string) {
  const { secret, keyVersion } = getCustomerIdentityHashingEnv();
  return createHmac("sha256", secret)
    .update(`quick-auth-requester:v${keyVersion}:${requestIdentity}`)
    .digest("hex");
}

export function isPhoneFirstQuickAuthEnabled() {
  return process.env.PHONE_FIRST_QUICK_AUTH_ENABLED !== "false";
}

export function isBusinessPhoneOtpEnabled() {
  return process.env.BUSINESS_PHONE_OTP_ENABLED !== "false";
}

"use client";

import { createClient } from "@/src/lib/supabase/client";

import { canonicalMoldovaE164 } from "./auth-phone";

export class PhoneOtpClientError extends Error {
  constructor() {
    super("Phone authentication failed.");
    this.name = "PhoneOtpClientError";
  }
}

export function normalizeMoldovaAuthPhone(value: string): string {
  const normalized = canonicalMoldovaE164(value);
  if (!normalized) throw new PhoneOtpClientError();
  return normalized;
}

export async function requestPhoneOtp(phone: string, captchaToken?: string) {
  const { error } = await createClient().auth.signInWithOtp({
    phone: normalizeMoldovaAuthPhone(phone),
    options: {
      shouldCreateUser: true,
      captchaToken: captchaToken || undefined,
    },
  });
  if (error) throw new PhoneOtpClientError();
}

export async function verifyPhoneOtp(phone: string, token: string) {
  if (!/^\d{6}$/.test(token)) throw new PhoneOtpClientError();
  const { data, error } = await createClient().auth.verifyOtp({
    phone: normalizeMoldovaAuthPhone(phone),
    token,
    type: "sms",
  });
  if (error || !data.session || !data.user) throw new PhoneOtpClientError();
  return data;
}

import { Webhook } from "standardwebhooks";
import { describe, expect, it, vi } from "vitest";

import { handleSupabaseSendSmsHook, SendSmsHookVerificationError } from "../send-sms-hook.service";

const base64Secret = Buffer.from("final-customer-hook-secret-32bytes!").toString("base64");
const configuredSecret = `v1,whsec_${base64Secret}`;

function signedRequest(payload: string, id = "message-0001", secret = `whsec_${base64Secret}`) {
  const timestamp = new Date();
  const signature = new Webhook(secret).sign(id, timestamp, payload);
  return new Headers({
    "webhook-id": id,
    "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1_000)),
    "webhook-signature": signature,
  });
}

describe("Supabase Send SMS Hook", () => {
  it("verifies Standard Webhooks and forwards only the expected phone/OTP contract", async () => {
    const payload = JSON.stringify({
      user: { id: "6481a5c1-3d37-4a56-9f6a-bee08c554965", phone: "+37369123456", role: "authenticated" },
      sms: { otp: "561166", channel: "sms" },
      hook: "send_sms",
    });
    const send = vi.fn(async () => ({ purpose: "AUTH_OTP" as const, provider: "moldcell" as const, transport: "relay" as const, accepted: true as const, correlationId: "6481a5c1-3d37-4a56-9f6a-bee08c554965" }));
    await expect(handleSupabaseSendSmsHook(payload, signedRequest(payload), {
      environment: { SUPABASE_SEND_SMS_HOOK_SECRET: configuredSecret },
      service: { send },
    })).resolves.toMatchObject({ purpose: "AUTH_OTP", accepted: true });
    expect(send).toHaveBeenCalledWith({ authUserId: "6481a5c1-3d37-4a56-9f6a-bee08c554965", webhookId: "message-0001", phone: "+37369123456", otp: "561166" });
  });

  it("uses the signed SMS destination for phone-change enrollment", async () => {
    const payload = JSON.stringify({
      user: {
        id: "6481a5c1-3d37-4a56-9f6a-bee08c554965",
        phone: "",
        role: "authenticated",
      },
      sms: {
        otp: "561166",
        phone: "+37368123456",
        sms_type: "phone_change",
      },
    });
    const send = vi.fn(async () => ({ purpose: "AUTH_OTP" as const, provider: "moldcell" as const, transport: "relay" as const, accepted: true as const, correlationId: "6481a5c1-3d37-4a56-9f6a-bee08c554965" }));

    await handleSupabaseSendSmsHook(payload, signedRequest(payload), {
      environment: { SUPABASE_SEND_SMS_HOOK_SECRET: configuredSecret },
      service: { send },
    });

    expect(send).toHaveBeenCalledWith({
      authUserId: "6481a5c1-3d37-4a56-9f6a-bee08c554965",
      webhookId: "message-0001",
      phone: "+37368123456",
      otp: "561166",
    });
  });

  it("supports bounded secret rotation and rejects unsigned or malformed payloads", async () => {
    const payload = JSON.stringify({ user: { id: "6481a5c1-3d37-4a56-9f6a-bee08c554965", phone: "+37369123456" }, sms: { otp: "561166" } });
    const send = vi.fn(async () => ({ purpose: "AUTH_OTP" as const, provider: "moldcell" as const, transport: "relay" as const, accepted: true as const, correlationId: "6481a5c1-3d37-4a56-9f6a-bee08c554965" }));
    await expect(handleSupabaseSendSmsHook(payload, signedRequest(payload), {
      environment: { SUPABASE_SEND_SMS_HOOK_SECRET: `v1,whsec_${Buffer.from("old-secret-that-is-at-least-32-bytes").toString("base64")}|${configuredSecret}` },
      service: { send },
    })).resolves.toBeTruthy();
    await expect(handleSupabaseSendSmsHook(payload, new Headers(), {
      environment: { SUPABASE_SEND_SMS_HOOK_SECRET: configuredSecret }, service: { send },
    })).rejects.toMatchObject({ code: "SIGNATURE_INVALID" } satisfies Partial<SendSmsHookVerificationError>);

    const malformed = JSON.stringify({ user: { id: "6481a5c1-3d37-4a56-9f6a-bee08c554965", phone: "+37369123456" }, sms: { otp: "not-an-otp" } });
    await expect(handleSupabaseSendSmsHook(malformed, signedRequest(malformed), {
      environment: { SUPABASE_SEND_SMS_HOOK_SECRET: configuredSecret }, service: { send },
    })).rejects.toMatchObject({ code: "PAYLOAD_INVALID" } satisfies Partial<SendSmsHookVerificationError>);

    const missingUserId = JSON.stringify({ user: { phone: "+37369123456" }, sms: { otp: "561166" } });
    await expect(handleSupabaseSendSmsHook(missingUserId, signedRequest(missingUserId), {
      environment: { SUPABASE_SEND_SMS_HOOK_SECRET: configuredSecret }, service: { send },
    })).rejects.toMatchObject({ code: "PAYLOAD_INVALID" } satisfies Partial<SendSmsHookVerificationError>);
  });
});

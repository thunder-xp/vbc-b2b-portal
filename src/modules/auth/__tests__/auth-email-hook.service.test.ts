import { Webhook } from "standardwebhooks";
import { describe, expect, it, vi } from "vitest";

import { handleSupabaseSendEmailHook, SendEmailHookError } from "../auth-email-hook.service";

const base64Secret = Buffer.from("partner-auth-email-hook-secret-32bytes").toString("base64");
const configuredSecret = `v1,whsec_${base64Secret}`;

function signedRequest(payload: string, id = "email-message-0001") {
  const timestamp = new Date();
  const signature = new Webhook(`whsec_${base64Secret}`).sign(id, timestamp, payload);
  return new Headers({
    "webhook-id": id,
    "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1_000)),
    "webhook-signature": signature,
  });
}

function signupPayload() {
  return JSON.stringify({
    user: {
      id: "6481a5c1-3d37-4a56-9f6a-bee08c554965",
      email: "admin@psg.md",
      user_metadata: { preferred_registration_locale: "ru" },
    },
    email_data: {
      token: "561166",
      token_hash: "abc123",
      redirect_to: "https://www.nsd.md/auth/sign-in?confirmed=1",
      email_action_type: "signup",
      token_new: "",
      token_hash_new: "",
    },
  });
}

describe("Supabase Send Email Hook", () => {
  it("verifies the webhook and sends a governed confirmation link through SMTP", async () => {
    const payload = signupPayload();
    const send = vi.fn<(message: { text: string }) => Promise<{ messageId: string; category: "accepted" }>>(async () => ({ messageId: "accepted", category: "accepted" }));
    await expect(handleSupabaseSendEmailHook(payload, signedRequest(payload), {
      environment: { SUPABASE_SEND_EMAIL_HOOK_SECRET: configuredSecret },
      provider: { send },
      supabaseUrl: "https://project.supabase.co",
    })).resolves.toMatchObject({ accepted: 1 });

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: "admin@psg.md",
      subject: expect.stringContaining("Novotech"),
      text: expect.stringContaining("https://project.supabase.co/auth/v1/verify?"),
      html: expect.stringContaining("token_hash=abc123"),
      messageId: expect.stringMatching(/^<supabase-auth-[a-f0-9]{64}@nsd\.md>$/),
    }));
    expect(send.mock.calls[0]![0].text).not.toContain("email-message-0001");
  });

  it("uses the documented reversed hashes for secure email change", async () => {
    const payload = JSON.stringify({
      user: {
        id: "6481a5c1-3d37-4a56-9f6a-bee08c554965",
        email: "old@example.com",
        new_email: "new@example.com",
      },
      email_data: {
        token: "111111",
        token_hash: "new-hash",
        redirect_to: "https://www.nsd.md/auth/sign-in",
        email_action_type: "email_change",
        token_new: "222222",
        token_hash_new: "old-hash",
      },
    });
    const send = vi.fn<(message: { to: string; text: string }) => Promise<{ messageId: string; category: "accepted" }>>(async () => ({ messageId: "accepted", category: "accepted" }));
    await expect(handleSupabaseSendEmailHook(payload, signedRequest(payload), {
      environment: { SUPABASE_SEND_EMAIL_HOOK_SECRET: configuredSecret }, provider: { send }, supabaseUrl: "https://project.supabase.co",
    })).resolves.toMatchObject({ accepted: 2 });
    expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({ to: "old@example.com", text: expect.stringContaining("token_hash=old-hash") }));
    expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({ to: "new@example.com", text: expect.stringContaining("token_hash=new-hash") }));
  });

  it("delivers security notifications without requiring verification tokens", async () => {
    const payload = JSON.stringify({
      user: { id: "6481a5c1-3d37-4a56-9f6a-bee08c554965", email: "new@example.com" },
      email_data: {
        token: "", token_hash: "", redirect_to: "", email_action_type: "email_changed_notification",
        token_new: "", token_hash_new: "", old_email: "old@example.com",
      },
    });
    const send = vi.fn<(message: { to: string }) => Promise<{ messageId: string; category: "accepted" }>>(async () => ({ messageId: "accepted", category: "accepted" }));
    await expect(handleSupabaseSendEmailHook(payload, signedRequest(payload), {
      environment: { SUPABASE_SEND_EMAIL_HOOK_SECRET: configuredSecret }, provider: { send }, supabaseUrl: "https://project.supabase.co",
    })).resolves.toMatchObject({ accepted: 1 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "old@example.com" }));
  });

  it("fails closed for unsigned, malformed, or undeliverable requests", async () => {
    const payload = signupPayload();
    const send = vi.fn();
    await expect(handleSupabaseSendEmailHook(payload, new Headers(), {
      environment: { SUPABASE_SEND_EMAIL_HOOK_SECRET: configuredSecret }, provider: { send }, supabaseUrl: "https://project.supabase.co",
    })).rejects.toMatchObject({ code: "SIGNATURE_INVALID" } satisfies Partial<SendEmailHookError>);

    const malformed = JSON.stringify({ user: { id: "not-a-uuid", email: "admin@psg.md" }, email_data: {} });
    await expect(handleSupabaseSendEmailHook(malformed, signedRequest(malformed), {
      environment: { SUPABASE_SEND_EMAIL_HOOK_SECRET: configuredSecret }, provider: { send }, supabaseUrl: "https://project.supabase.co",
    })).rejects.toMatchObject({ code: "PAYLOAD_INVALID" } satisfies Partial<SendEmailHookError>);

    await expect(handleSupabaseSendEmailHook(payload, signedRequest(payload), {
      environment: { SUPABASE_SEND_EMAIL_HOOK_SECRET: configuredSecret },
      provider: { send: vi.fn(async () => { throw new Error("provider details"); }) },
      supabaseUrl: "https://project.supabase.co",
    })).rejects.toMatchObject({ code: "DELIVERY_FAILED", message: "Send Email hook request rejected." });
  });
});

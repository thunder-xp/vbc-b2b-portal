import { Webhook } from "standardwebhooks";
import { describe, expect, it, vi } from "vitest";

import { ProposalEmailProviderError } from "@/src/modules/estimates/services/proposal-email.provider";
import type { SmtpProposalEmailProvider } from "@/src/modules/estimates/services/proposal-email.provider";
import { handleSupabaseSendEmailHook, SendEmailHookError } from "../send-email-hook.service";

const base64Secret = Buffer.from("auth-send-email-hook-secret-32bytes!").toString("base64");
const configuredSecret = `v1,whsec_${base64Secret}`;
const environment = {
  SUPABASE_SEND_EMAIL_HOOK_SECRET: configuredSecret,
  NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co",
  PUBLIC_APP_URL: "https://www.nsd.md",
  NODE_ENV: "production",
};

function payload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    user: {
      id: "6481a5c1-3d37-4a56-9f6a-bee08c554965",
      email: "controlled@example.test",
      new_email: "new@example.test",
      user_metadata: { registration_intent: "agent", preferred_registration_locale: "ro" },
    },
    email_data: {
      token: "513820",
      token_hash: "a".repeat(64),
      token_new: "",
      token_hash_new: "",
      redirect_to: "https://www.nsd.md/auth/sign-in?confirmed=1&lang=ro&intent=agent&next=%2Fbecome-partner%2Fagent%3Flang%3Dro",
      email_action_type: "signup",
      site_url: "https://www.nsd.md",
    },
    ...overrides,
  });
}

function signedHeaders(
  body: string,
  id = "email-hook-event-1",
  secret = `whsec_${base64Secret}`,
  timestamp = new Date(),
) {
  return new Headers({
    "webhook-id": id,
    "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1_000)),
    "webhook-signature": new Webhook(secret).sign(id, timestamp, body),
  });
}

describe("Supabase Send Email Hook service", () => {
  it("verifies signup payload and sends one localized signed confirmation link through shared SMTP", async () => {
    const body = payload();
    const send = vi.fn<SmtpProposalEmailProvider["send"]>(async () => ({ messageId: null, category: "accepted" as const }));
    const result = await handleSupabaseSendEmailHook(body, signedHeaders(body), {
      environment,
      provider: { send },
      correlationId: "server-correlation-1",
    });

    expect(result).toMatchObject({ correlationId: "server-correlation-1" });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(send).toHaveBeenCalledOnce();
    const message = send.mock.calls[0]![0];
    expect(message).toMatchObject({
      to: "controlled@example.test",
      subject: expect.stringContaining("Novotech"),
      timeoutMs: 4_000,
    });
    expect(message.text).toContain("Novotech");
    expect(message.text).not.toContain("513820");
    expect(message.html).toContain("lang=\"ro\"");
    const confirmationUrl = new URL(message.text.match(/https:\/\/[^\s]+/)?.[0] ?? "");
    expect(confirmationUrl.origin).toBe("https://project-ref.supabase.co");
    expect(confirmationUrl.pathname).toBe("/auth/v1/verify");
    expect(confirmationUrl.searchParams.get("token")).toBe("a".repeat(64));
    expect(confirmationUrl.searchParams.get("type")).toBe("signup");
    expect(confirmationUrl.searchParams.get("redirect_to")).toBe(payloadRedirect());
  });

  it("supports rotation with active and previous signed secret and rejects unsigned or malformed requests", async () => {
    const body = payload();
    const send = vi.fn<SmtpProposalEmailProvider["send"]>(async () => ({ messageId: null, category: "accepted" as const }));
    const previousSecret = `whsec_${Buffer.from("older-auth-hook-secret-at-least-32bytes").toString("base64")}`;
    await expect(handleSupabaseSendEmailHook(body, signedHeaders(body, "rotated-event", previousSecret), {
      environment: { ...environment, SUPABASE_SEND_EMAIL_HOOK_SECRET: `${configuredSecret}|v1,${previousSecret}` },
      provider: { send }, correlationId: "rotation-test",
    })).resolves.toMatchObject({ correlationId: "rotation-test" });

    await expect(handleSupabaseSendEmailHook(body, new Headers(), {
      environment, provider: { send }, correlationId: "unsigned-test",
    })).rejects.toMatchObject({ code: "SIGNATURE_INVALID" } satisfies Partial<SendEmailHookError>);

    const wrongSignature = signedHeaders(body, "wrong-key-event", `whsec_${Buffer.from("not-the-current-signing-secret").toString("base64")}`);
    await expect(handleSupabaseSendEmailHook(body, wrongSignature, {
      environment, provider: { send }, correlationId: "wrong-signature-test",
    })).rejects.toMatchObject({ code: "SIGNATURE_INVALID" } satisfies Partial<SendEmailHookError>);

    const malformed = payload({ email_data: { ...JSON.parse(payload()).email_data, email_action_type: "unsupported" } });
    await expect(handleSupabaseSendEmailHook(malformed, signedHeaders(malformed), {
      environment, provider: { send }, correlationId: "malformed-test",
    })).rejects.toMatchObject({ code: "PAYLOAD_INVALID" } satisfies Partial<SendEmailHookError>);
    expect(send).toHaveBeenCalledOnce();
  });

  it.each([
    ["webhook-id", { webhookIdPresent: false, webhookTimestampPresent: true, webhookSignaturePresent: true }],
    ["webhook-timestamp", { webhookIdPresent: true, webhookTimestampPresent: false, webhookSignaturePresent: true }],
    ["webhook-signature", { webhookIdPresent: true, webhookTimestampPresent: true, webhookSignaturePresent: false }],
  ] as const)("classifies a missing %s header without recording header values", async (header, expected) => {
    const body = payload();
    const headers = signedHeaders(body);
    headers.delete(header);
    const error = await captureHookError(body, headers);
    expect(error).toMatchObject({
      code: "SIGNATURE_INVALID",
      signatureDiagnostics: {
        ...expected,
        configuredSecretCount: 1,
        verificationFailureCategory: "MISSING_HEADERS",
      },
    });
    expect(Object.keys(error.signatureDiagnostics ?? {})).toEqual([
      "webhookIdPresent",
      "webhookTimestampPresent",
      "webhookSignaturePresent",
      "webhookIdShapeValid",
      "timestampParseValid",
      "timestampSkewSeconds",
      "signatureEntryCount",
      "signatureVersionShapeValid",
      "configuredSecretCount",
      "verificationFailureCategory",
    ]);
  });

  it("classifies malformed, old, and future timestamps with bounded skew", async () => {
    const body = payload();
    const malformed = signedHeaders(body);
    malformed.set("webhook-timestamp", "not-a-unix-time");
    await expect(captureHookError(body, malformed)).resolves.toMatchObject({
      signatureDiagnostics: {
        timestampParseValid: false,
        timestampSkewSeconds: null,
        verificationFailureCategory: "INVALID_TIMESTAMP",
      },
    });

    const oldTimestamp = new Date(Date.now() - 301_000);
    const old = await captureHookError(body, signedHeaders(body, "old-event", `whsec_${base64Secret}`, oldTimestamp));
    expect(old.signatureDiagnostics).toMatchObject({ timestampParseValid: true, verificationFailureCategory: "TIMESTAMP_TOO_OLD" });
    expect(old.signatureDiagnostics?.timestampSkewSeconds).toBeGreaterThan(300);

    const futureTimestamp = new Date(Date.now() + 301_000);
    const future = await captureHookError(body, signedHeaders(body, "future-event", `whsec_${base64Secret}`, futureTimestamp));
    expect(future.signatureDiagnostics).toMatchObject({ timestampParseValid: true, verificationFailureCategory: "TIMESTAMP_TOO_NEW" });
    expect(future.signatureDiagnostics?.timestampSkewSeconds).toBeLessThan(-300);

    const farFutureTimestamp = new Date(Date.now() + 10 * 24 * 60 * 60 * 1_000);
    const farFuture = await captureHookError(body, signedHeaders(body, "far-future-event", `whsec_${base64Secret}`, farFutureTimestamp));
    expect(farFuture.signatureDiagnostics?.timestampSkewSeconds).toBe(-86_400);
  });

  it("classifies structurally valid headers signed with the wrong secret as NO_MATCHING_SIGNATURE", async () => {
    const body = payload();
    const wrongSecret = `whsec_${Buffer.from("different-signing-secret-at-least-32bytes").toString("base64")}`;
    const error = await captureHookError(body, signedHeaders(body, "wrong-secret-event", wrongSecret));
    expect(error.signatureDiagnostics).toEqual({
      webhookIdPresent: true,
      webhookTimestampPresent: true,
      webhookSignaturePresent: true,
      webhookIdShapeValid: true,
      timestampParseValid: true,
      timestampSkewSeconds: expect.any(Number),
      signatureEntryCount: 1,
      signatureVersionShapeValid: true,
      configuredSecretCount: 1,
      verificationFailureCategory: "NO_MATCHING_SIGNATURE",
    });
  });

  it("classifies a malformed signature structure without weakening verification", async () => {
    const body = payload();
    const headers = signedHeaders(body);
    headers.set("webhook-signature", "v2,not-a-supported-signature");
    const error = await captureHookError(body, headers);
    expect(error.signatureDiagnostics).toMatchObject({
      signatureEntryCount: 1,
      signatureVersionShapeValid: false,
      verificationFailureCategory: "MALFORMED_SIGNATURE",
    });
  });

  it("verifies the untouched raw body and rejects a reserialized form signed for different bytes", async () => {
    const rawBody = JSON.stringify(JSON.parse(payload()), null, 2);
    const send = vi.fn<SmtpProposalEmailProvider["send"]>(async () => ({ messageId: null, category: "accepted" as const }));
    await expect(handleSupabaseSendEmailHook(rawBody, signedHeaders(rawBody), {
      environment, provider: { send }, correlationId: "raw-body-success",
    })).resolves.toMatchObject({ correlationId: "raw-body-success" });

    const reserializedBody = JSON.stringify(JSON.parse(rawBody));
    const error = await captureHookError(reserializedBody, signedHeaders(rawBody, "raw-body-mismatch"));
    expect(error.signatureDiagnostics?.verificationFailureCategory).toBe("NO_MATCHING_SIGNATURE");
    expect(send).toHaveBeenCalledOnce();
  });

  it("accepts both governed secret forms and the bounded previous secret", async () => {
    const body = payload();
    const send = vi.fn<SmtpProposalEmailProvider["send"]>(async () => ({ messageId: null, category: "accepted" as const }));
    await expect(handleSupabaseSendEmailHook(body, signedHeaders(body, "prefixed-secret"), {
      environment, provider: { send }, correlationId: "prefixed-secret",
    })).resolves.toBeTruthy();
    await expect(handleSupabaseSendEmailHook(body, signedHeaders(body, "bare-secret"), {
      environment: { ...environment, SUPABASE_SEND_EMAIL_HOOK_SECRET: `whsec_${base64Secret}` },
      provider: { send }, correlationId: "bare-secret",
    })).resolves.toBeTruthy();

    const previousSecret = `whsec_${Buffer.from("previous-signing-secret-is-long-enough").toString("base64")}`;
    await expect(handleSupabaseSendEmailHook(body, signedHeaders(body, "previous-secret", previousSecret), {
      environment: { ...environment, SUPABASE_SEND_EMAIL_HOOK_SECRET: `${configuredSecret}|v1,${previousSecret}` },
      provider: { send }, correlationId: "previous-secret",
    })).resolves.toBeTruthy();
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("accepts matching first and second v1 signatures in Supabase's rotation header shape", async () => {
    const body = payload();
    const id = "multiple-signature-event";
    const timestamp = new Date();
    const activeSecret = `whsec_${base64Secret}`;
    const previousSecret = `whsec_${Buffer.from("previous-multiple-signature-secret").toString("base64")}`;
    const activeSignature = new Webhook(activeSecret).sign(id, timestamp, body);
    const previousSignature = new Webhook(previousSecret).sign(id, timestamp, body);
    const createHeaders = (signature: string) => new Headers({
      "webhook-id": id,
      "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1_000)),
      "webhook-signature": signature,
    });
    const send = vi.fn<SmtpProposalEmailProvider["send"]>(async () => ({ messageId: null, category: "accepted" as const }));

    await expect(handleSupabaseSendEmailHook(body, createHeaders(`${activeSignature}, ${previousSignature}`), {
      environment, provider: { send }, correlationId: "matching-first-signature",
    })).resolves.toBeTruthy();
    await expect(handleSupabaseSendEmailHook(body, createHeaders(`${previousSignature}, ${activeSignature}`), {
      environment, provider: { send }, correlationId: "matching-second-signature",
    })).resolves.toBeTruthy();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("rejects more than two configured rotation secrets", async () => {
    const body = payload();
    const threeSecrets = [configuredSecret, configuredSecret, configuredSecret].join("|");
    await expect(handleSupabaseSendEmailHook(body, signedHeaders(body), {
      environment: { ...environment, SUPABASE_SEND_EMAIL_HOOK_SECRET: threeSecrets },
      provider: { send: vi.fn() }, correlationId: "too-many-secrets",
    })).rejects.toMatchObject({ code: "CONFIGURATION_INVALID" } satisfies Partial<SendEmailHookError>);
  });

  it.each(["signup", "invite", "magiclink", "recovery", "email", "reauthentication"] as const)(
    "builds the Supabase confirmation URL for the %s action type",
    async (emailActionType) => {
      const body = payload({ email_data: { ...JSON.parse(payload()).email_data, email_action_type: emailActionType } });
      const send = vi.fn<SmtpProposalEmailProvider["send"]>(async () => ({ messageId: null, category: "accepted" as const }));
      await handleSupabaseSendEmailHook(body, signedHeaders(body), { environment, provider: { send }, correlationId: emailActionType });
      const url = new URL(send.mock.calls[0]![0].text.match(/https:\/\/[^\s]+/)?.[0] ?? "");
      expect(url.searchParams.get("type")).toBe(emailActionType);
      expect(url.searchParams.get("redirect_to")).toBe(payloadRedirect());
    },
  );

  it("fails closed for missing configuration and unapproved redirect destinations", async () => {
    const body = payload();
    const send = vi.fn<SmtpProposalEmailProvider["send"]>(async () => ({ messageId: null, category: "accepted" as const }));
    await expect(handleSupabaseSendEmailHook(body, signedHeaders(body), {
      environment: { ...environment, SUPABASE_SEND_EMAIL_HOOK_SECRET: "" },
      provider: { send }, correlationId: "missing-config",
    })).rejects.toMatchObject({ code: "CONFIGURATION_INVALID" } satisfies Partial<SendEmailHookError>);

    const untrustedRedirect = payload({ email_data: { ...JSON.parse(payload()).email_data, redirect_to: "https://attacker.example/" } });
    await expect(handleSupabaseSendEmailHook(untrustedRedirect, signedHeaders(untrustedRedirect), {
      environment, provider: { send }, correlationId: "redirect-test",
    })).rejects.toMatchObject({ code: "PAYLOAD_INVALID" } satisfies Partial<SendEmailHookError>);
    expect(send).not.toHaveBeenCalled();
  });

  it("uses Supabase's documented current/new address and token hash mapping for secure email change", async () => {
    const template = JSON.parse(payload());
    const body = payload({
      email_data: {
        ...template.email_data,
        email_action_type: "email_change",
        token_new: "829104",
        token_hash_new: "b".repeat(64),
      },
    });
    const send = vi.fn<SmtpProposalEmailProvider["send"]>(async () => ({ messageId: null, category: "accepted" as const }));
    await handleSupabaseSendEmailHook(body, signedHeaders(body), { environment, provider: { send }, correlationId: "email-change" });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]![0].to).toBe("controlled@example.test");
    expect(new URL(send.mock.calls[0]![0].text.match(/https:\/\/[^\s]+/)?.[0] ?? "").searchParams.get("token")).toBe("b".repeat(64));
    expect(send.mock.calls[1]![0].to).toBe("new@example.test");
    expect(new URL(send.mock.calls[1]![0].text.match(/https:\/\/[^\s]+/)?.[0] ?? "").searchParams.get("token")).toBe("a".repeat(64));
  });

  it("sends supported account notifications without creating token links", async () => {
    const template = JSON.parse(payload());
    const body = payload({ email_data: { ...template.email_data, email_action_type: "password_changed_notification", token: "", token_hash: "" } });
    const send = vi.fn<SmtpProposalEmailProvider["send"]>(async () => ({ messageId: null, category: "accepted" as const }));
    await handleSupabaseSendEmailHook(body, signedHeaders(body), { environment, provider: { send }, correlationId: "notification" });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0].text).toContain("Set\u0103rile");
    expect(send.mock.calls[0]![0].text).not.toContain("https://");
  });

  it.each([
    ["transient timeout", new ProposalEmailProviderError("timeout"), "DELIVERY_UNAVAILABLE"],
    ["provider unavailable", new ProposalEmailProviderError("unavailable"), "DELIVERY_UNAVAILABLE"],
    ["SMTP configuration", new ProposalEmailProviderError("configuration"), "DELIVERY_CONFIGURATION_INVALID"],
    ["SMTP authentication", new ProposalEmailProviderError("authentication"), "DELIVERY_CONFIGURATION_INVALID"],
  ] as const)("classifies %s without exposing provider details", async (_name, failure, expectedCode) => {
    const body = payload();
    await expect(handleSupabaseSendEmailHook(body, signedHeaders(body), {
      environment, provider: { send: vi.fn(async () => { throw failure; }) }, correlationId: "delivery-test",
    })).rejects.toMatchObject({ code: expectedCode } satisfies Partial<SendEmailHookError>);
  });
});

function payloadRedirect() {
  return "https://www.nsd.md/auth/sign-in?confirmed=1&lang=ro&intent=agent&next=%2Fbecome-partner%2Fagent%3Flang%3Dro";
}

async function captureHookError(body: string, headers: Headers): Promise<SendEmailHookError> {
  try {
    await handleSupabaseSendEmailHook(body, headers, {
      environment,
      provider: { send: vi.fn() },
      correlationId: "diagnostic-test",
    });
  } catch (error) {
    expect(error).toBeInstanceOf(SendEmailHookError);
    return error as SendEmailHookError;
  }
  throw new Error("Expected the Send Email hook to reject the request.");
}

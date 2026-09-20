import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AuthSmsDeliveryError,
  FinalCustomerAuthSmsService,
  readAuthSmsPolicy,
  type GovernedBusinessAuthSmsIntent,
} from "../auth-sms.service";

const authUserId = "6481a5c1-3d37-4a56-9f6a-bee08c554965";
const baseEnvironment = {
  AUTH_SMS_ENABLED: "true",
  AUTH_SMS_MODE: "SANDBOX",
  SMS_SANDBOX_ALLOWED_RECIPIENTS: "+37369123456",
  CUSTOMER_IDENTITY_HMAC_SECRET: "customer-identity-test-secret-at-least-32-bytes",
  CUSTOMER_IDENTITY_HMAC_KEY_VERSION: "1",
  MOLDCELL_TRANSPORT_MODE: "relay",
  MOLDCELL_RELAY_URL: "https://api.novotech.systems/internal/omnichannel/v1/sms/moldcell",
  MOLDCELL_RELAY_KEY_ID: "acceptance-key",
  MOLDCELL_RELAY_AUTH_SECRET: "relay-auth-secret-at-least-32-bytes-long",
};

const acceptedResponse = () => new Response(
  JSON.stringify({ resultCode: 0, resultDate: "2026-09-13T19:30:00Z" }),
  { status: 200 },
);

describe("governed AUTH_OTP SMS", () => {
  beforeEach(() => {
    vi.stubEnv("CUSTOMER_IDENTITY_HMAC_SECRET", baseEnvironment.CUSTOMER_IDENTITY_HMAC_SECRET);
    vi.stubEnv("CUSTOMER_IDENTITY_HMAC_KEY_VERSION", "1");
  });

  it("preserves sandbox allowlisted legacy Auth SMS behavior", async () => {
    const fetchImplementation = vi.fn(async () => acceptedResponse()) as unknown as typeof fetch;
    const reserve = vi.fn(async () => true);
    const resolve = vi.fn(async () => null);
    const service = new FinalCustomerAuthSmsService({ reserve }, baseEnvironment, fetchImplementation, { resolve });

    await expect(service.send(input("hook-message-1", "+37369123456"))).resolves.toMatchObject({
      purpose: "AUTH_OTP", provider: "moldcell", transport: "relay", accepted: true,
    });
    expect(resolve).toHaveBeenCalledWith(authUserId, expect.stringMatching(/^[0-9a-f]{64}$/));
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetchImplementation).mock.calls[0]?.[1]?.body)).toContain("Код входа NSD: 123456");
  });

  it("rejects a random non-allowlisted sandbox phone without a governed challenge", async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch;
    const reserve = vi.fn(async () => true);

    await expect(serviceWithIntent(null, reserve, fetchImplementation).send(input("no-intent", "+37368123456")))
      .rejects.toMatchObject({ code: "RECIPIENT_NOT_ALLOWED" } satisfies Partial<AuthSmsDeliveryError>);
    expect(reserve).not.toHaveBeenCalled();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("allows governed Business enrollment and uses enrollment wording", async () => {
    const fetchImplementation = vi.fn(async () => acceptedResponse()) as unknown as typeof fetch;
    const reserve = vi.fn(async () => true);

    await expect(serviceWithIntent("BUSINESS_PHONE_ENROLLMENT", reserve, fetchImplementation)
      .send(input("enrollment", "+37368123456"))).resolves.toMatchObject({ accepted: true });
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetchImplementation).mock.calls[0]?.[1]?.body))
      .toContain("Код подтверждения телефона NSD: 123456");
  });

  it("allows governed Business Quick Auth and keeps login wording", async () => {
    const fetchImplementation = vi.fn(async () => acceptedResponse()) as unknown as typeof fetch;
    const reserve = vi.fn(async () => true);

    await expect(serviceWithIntent("BUSINESS_QUICK_AUTH", reserve, fetchImplementation)
      .send(input("quick-auth", "+37368123456"))).resolves.toMatchObject({ accepted: true });
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetchImplementation).mock.calls[0]?.[1]?.body)).toContain("Код входа NSD: 123456");
  });

  it("keeps both global kill switches absolute for governed challenges", async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch;
    const resolve = vi.fn(async () => "BUSINESS_PHONE_ENROLLMENT" as const);
    const disabled = new FinalCustomerAuthSmsService(
      { reserve: async () => true }, { ...baseEnvironment, AUTH_SMS_ENABLED: "false" }, fetchImplementation, { resolve },
    );
    const disabledMode = new FinalCustomerAuthSmsService(
      { reserve: async () => true }, { ...baseEnvironment, AUTH_SMS_MODE: "DISABLED" }, fetchImplementation, { resolve },
    );

    await expect(disabled.send(input("disabled", "+37368123456")))
      .rejects.toMatchObject({ code: "DISABLED" } satisfies Partial<AuthSmsDeliveryError>);
    await expect(disabledMode.send(input("disabled-mode", "+37368123456")))
      .rejects.toMatchObject({ code: "DISABLED" } satisfies Partial<AuthSmsDeliveryError>);
    expect(resolve).not.toHaveBeenCalled();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("keeps rate limiting and provider rejection fail-closed", async () => {
    const fetchImplementation = vi.fn(async () => new Response(
      JSON.stringify({ resultCode: 10, resultMessage: "rejected" }), { status: 200 },
    )) as unknown as typeof fetch;

    await expect(serviceWithIntent("BUSINESS_QUICK_AUTH", async () => false, fetchImplementation)
      .send(input("rate-limited", "+37368123456")))
      .rejects.toMatchObject({ code: "RATE_LIMITED" } satisfies Partial<AuthSmsDeliveryError>);
    expect(fetchImplementation).not.toHaveBeenCalled();

    await expect(serviceWithIntent("BUSINESS_QUICK_AUTH", async () => true, fetchImplementation)
      .send(input("provider-rejected", "+37368123456")))
      .rejects.toMatchObject({ code: "DELIVERY_FAILED" } satisfies Partial<AuthSmsDeliveryError>);
  });

  it("defaults to disabled and never inherits the business SMS mode", () => {
    expect(readAuthSmsPolicy({ SMS_MODE: "SANDBOX", AUTH_SMS_ENABLED: "true" }).mode).toBe("DISABLED");
    expect(readAuthSmsPolicy({ AUTH_SMS_MODE: "PRODUCTION", AUTH_SMS_ENABLED: "false" }).enabled).toBe(false);
  });
});

function input(webhookId: string, phone: string) {
  return { authUserId, webhookId, phone, otp: "123456" };
}

function serviceWithIntent(
  intent: GovernedBusinessAuthSmsIntent | null,
  reserve: (phoneKeyHash: string) => Promise<boolean>,
  fetchImplementation: typeof fetch,
) {
  return new FinalCustomerAuthSmsService(
    { reserve }, baseEnvironment, fetchImplementation, { resolve: async () => intent },
  );
}

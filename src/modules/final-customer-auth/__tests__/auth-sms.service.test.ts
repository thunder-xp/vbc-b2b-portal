import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthSmsDeliveryError, FinalCustomerAuthSmsService, readAuthSmsPolicy } from "../auth-sms.service";

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

describe("Final Customer AUTH_OTP SMS", () => {
  beforeEach(() => {
    vi.stubEnv("CUSTOMER_IDENTITY_HMAC_SECRET", baseEnvironment.CUSTOMER_IDENTITY_HMAC_SECRET);
    vi.stubEnv("CUSTOMER_IDENTITY_HMAC_KEY_VERSION", "1");
  });

  it("is isolated, sandboxed and sends once through the existing relay provider", async () => {
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({ resultCode: 0, resultDate: "2026-09-13T19:30:00Z" }), { status: 200 })) as unknown as typeof fetch;
    const reserve = vi.fn(async () => true);
    const service = new FinalCustomerAuthSmsService({ reserve }, baseEnvironment, fetchImplementation);
    const result = await service.send({ webhookId: "hook-message-1", phone: "+37369123456", otp: "123456" });
    expect(result).toMatchObject({ purpose: "AUTH_OTP", provider: "moldcell", transport: "relay", accepted: true });
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(fetchImplementation).mock.calls[0]!;
    expect(String(init?.body)).toContain("Код входа NSD: 123456");
  });

  it("rejects disabled, non-allowlisted and rate-limited sends before provider transport", async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch;
    await expect(new FinalCustomerAuthSmsService({ reserve: async () => true }, { ...baseEnvironment, AUTH_SMS_ENABLED: "false" }, fetchImplementation).send({ webhookId: "one", phone: "+37369123456", otp: "123456" }))
      .rejects.toMatchObject({ code: "DISABLED" } satisfies Partial<AuthSmsDeliveryError>);
    await expect(new FinalCustomerAuthSmsService({ reserve: async () => true }, baseEnvironment, fetchImplementation).send({ webhookId: "two", phone: "+37368123456", otp: "123456" }))
      .rejects.toMatchObject({ code: "RECIPIENT_NOT_ALLOWED" } satisfies Partial<AuthSmsDeliveryError>);
    await expect(new FinalCustomerAuthSmsService({ reserve: async () => false }, baseEnvironment, fetchImplementation).send({ webhookId: "three", phone: "+37369123456", otp: "123456" }))
      .rejects.toMatchObject({ code: "RATE_LIMITED" } satisfies Partial<AuthSmsDeliveryError>);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("defaults to disabled and never inherits the business SMS mode", () => {
    expect(readAuthSmsPolicy({ SMS_MODE: "SANDBOX", AUTH_SMS_ENABLED: "true" }).mode).toBe("DISABLED");
    expect(readAuthSmsPolicy({ AUTH_SMS_MODE: "PRODUCTION", AUTH_SMS_ENABLED: "false" }).enabled).toBe(false);
  });
});

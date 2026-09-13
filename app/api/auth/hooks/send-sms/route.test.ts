import { afterEach, describe, expect, it } from "vitest";

import { POST } from "./route";

const previousHookSecret = process.env.SUPABASE_SEND_SMS_HOOK_SECRET;

afterEach(() => {
  if (previousHookSecret === undefined) delete process.env.SUPABASE_SEND_SMS_HOOK_SECRET;
  else process.env.SUPABASE_SEND_SMS_HOOK_SECRET = previousHookSecret;
});

describe("Final Customer Send SMS hook route", () => {
  it("fails closed without exposing missing server configuration", async () => {
    delete process.env.SUPABASE_SEND_SMS_HOOK_SECRET;

    const response = await POST(new Request("https://www.nsd.md/api/auth/hooks/send-sms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user: { id: crypto.randomUUID(), phone: "+37369123456" }, sms: { otp: "123456" } }),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: { http_code: 503, message: "DELIVERY_UNAVAILABLE" },
    });
  });
});

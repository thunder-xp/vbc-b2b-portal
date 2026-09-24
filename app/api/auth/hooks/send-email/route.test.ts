import { afterEach, describe, expect, it } from "vitest";

import { POST } from "./route";

const previousHookSecret = process.env.SUPABASE_SEND_EMAIL_HOOK_SECRET;

afterEach(() => {
  if (previousHookSecret === undefined) delete process.env.SUPABASE_SEND_EMAIL_HOOK_SECRET;
  else process.env.SUPABASE_SEND_EMAIL_HOOK_SECRET = previousHookSecret;
});

describe("Send Email hook route", () => {
  it("fails closed without exposing missing server configuration", async () => {
    delete process.env.SUPABASE_SEND_EMAIL_HOOK_SECRET;
    const response = await POST(new Request("https://www.nsd.md/api/auth/hooks/send-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user: { id: crypto.randomUUID(), email: "admin@psg.md" }, email_data: {} }),
    }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: { http_code: 503, message: "DELIVERY_UNAVAILABLE" } });
  });

  it("rejects non-JSON and oversized bodies before verification", async () => {
    await expect(POST(new Request("https://www.nsd.md/api/auth/hooks/send-email", { method: "POST", body: "text" })))
      .resolves.toMatchObject({ status: 400 });
    await expect(POST(new Request("https://www.nsd.md/api/auth/hooks/send-email", {
      method: "POST", headers: { "content-type": "application/json", "content-length": "70000" }, body: "{}",
    }))).resolves.toMatchObject({ status: 400 });
  });
});

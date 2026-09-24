import { describe, expect, it, vi } from "vitest";

import { resolvePartnerRegistrationIdentityState } from "../partner-registration-state";

const environment = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
};

describe("partner registration identity state", () => {
  it.each([
    [[], "MISSING"],
    [[{ email: "admin@psg.md", email_confirmed_at: null }], "UNCONFIRMED"],
    [[{ email: "ADMIN@PSG.MD", email_confirmed_at: "2026-09-24T15:00:00Z" }], "CONFIRMED"],
  ])("resolves exact server-side identity state", async (users, expected) => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ users }));
    await expect(resolvePartnerRegistrationIdentityState("admin@psg.md", { environment, fetcher }))
      .resolves.toBe(expected);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain("filter=admin%40psg.md");
    expect(init?.headers).toEqual(expect.objectContaining({ authorization: "Bearer service-role-secret" }));
  });

  it("does not accept substring matches returned by the Auth filter", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ users: [{ email: "other-admin@psg.md", email_confirmed_at: null }] }));
    await expect(resolvePartnerRegistrationIdentityState("admin@psg.md", { environment, fetcher })).resolves.toBe("MISSING");
  });
});

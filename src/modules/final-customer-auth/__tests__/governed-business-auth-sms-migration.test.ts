import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260920132814_governed_business_auth_sms.sql"),
  "utf8",
);

describe("governed Business Auth SMS migration", () => {
  it("requires a live OTP_SENT challenge bound to Auth user and keyed phone proof", () => {
    expect(migration).toContain("challenge.auth_user_id = p_auth_user_id");
    expect(migration).toContain("challenge.subject_auth_user_id = p_auth_user_id");
    expect(migration).toContain("challenge.phone_key_hash = p_phone_key_hash");
    expect(migration).toContain("challenge.status = 'OTP_SENT'");
    expect(migration).toContain("challenge.expires_at > now()");
  });

  it("requires current governed Business access for Quick Auth", () => {
    expect(migration).toContain("public.company_memberships");
    expect(migration).toContain("membership.status = 'active'");
    expect(migration).toContain("company.status = 'active'");
    expect(migration).toContain("public.commercial_agents");
    expect(migration).toContain("agent.status = 'ACTIVE'");
  });

  it("is service-role only and accepts no raw phone, OTP or session material", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain("to service_role");
    expect(migration).not.toMatch(/p_(?:raw_)?phone\b|p_otp\b|p_session\b|p_token\b/i);
  });
});

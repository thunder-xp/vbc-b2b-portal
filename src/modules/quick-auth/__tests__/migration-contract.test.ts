import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260920104322_unified_phone_first_quick_auth_v1.sql"),
  "utf8",
);

describe("Quick Auth migration contract", () => {
  it("stores only expiring pseudonymous challenge state", () => {
    expect(migration).toContain("phone_key_hash text not null");
    expect(migration).toContain("requester_key_hash text not null");
    expect(migration).toContain("expires_at timestamptz not null");
    expect(migration).toContain("otp_send_count smallint");
    expect(migration).toContain("otp_verification_attempt_count smallint");
    expect(migration).toContain("email_verification_attempt_count smallint");
    expect(migration).not.toMatch(/raw_phone|otp_code|access_token|refresh_token/i);
  });

  it("reuses the canonical Customer entitlement resolver and local Business truth", () => {
    expect(migration).toContain("public.resolve_customer_access_entitlement_v1(v_user_id)");
    expect(migration).toContain("public.company_memberships");
    expect(migration).toContain("public.commercial_agents");
    expect(migration).not.toMatch(/\bonec\b|https?:\/\/|net\.http/i);
  });

  it("keeps direct client access closed and all challenge operations service-role only", () => {
    expect(migration).toContain("force row level security");
    expect(migration).toContain("revoke all on table public.quick_auth_challenges from public, anon, authenticated, service_role");
    expect(migration).toContain("alter table public.business_phone_enrollment_challenges force row level security");
    expect(migration).toContain("alter table public.business_phone_enrollment_audit_events force row level security");
    expect(migration).not.toMatch(/grant\s+(?:select|insert|update|delete).*\s+to\s+(?:anon|authenticated)/i);
    expect(migration).toContain("grant execute on function public.prepare_business_phone_enrollment_v1(uuid, text, text) to service_role");
    expect(migration).toContain("grant execute on function public.business_phone_quick_auth_coverage_v1() to service_role");
  });

  it("enforces bounded resolver, send, verification and expiry rules server-side", () => {
    expect(migration).toContain("v_phone_count >= 5");
    expect(migration).toContain("v_requester_count >= 20");
    expect(migration).toContain("challenge.otp_send_count < 3");
    expect(migration).toContain("challenge.otp_verification_attempt_count < 6");
    expect(migration).toContain("challenge.expires_at > now()");
    expect(migration).toContain("interval '60 seconds'");
  });

  it("enforces rolling same-user enrollment without trusting profile contact phones", () => {
    expect(migration).toContain("candidate.id <> p_auth_user_id");
    expect(migration).toContain("candidate.phone_change = p_phone_e164");
    expect(migration).toContain("candidate.phone_confirmed_at is not null");
    expect(migration).toContain("BUSINESS_PHONE_ENROLLMENT_CONFIRMED");
    expect(migration).toContain("BUSINESS_PHONE_CHANGED");
    expect(migration).not.toMatch(/set\s+phone\s*=\s*profile\.phone/i);
  });
});

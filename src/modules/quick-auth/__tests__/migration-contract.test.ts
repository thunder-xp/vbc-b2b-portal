import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260920104322_unified_phone_first_quick_auth_v1.sql"),
  "utf8",
);
const recoveryMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260920150629_restore_existing_partner_phone_first_auth_v1.sql"),
  "utf8",
);
const profilePhoneStateMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260920154814_partner_profile_phone_verification_state_v2.sql"),
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

  it("discovers exactly one active governed Business profile by canonical Moldova phone", () => {
    expect(recoveryMigration).toContain("private.normalize_moldova_phone_e164_v1(profile.phone) = p_phone_e164");
    expect(recoveryMigration).toContain("v_business_candidate_count > 1");
    expect(recoveryMigration).toContain("then 'MULTIPLE_CONTEXT_EDGE_CASE'");
    expect(recoveryMigration).toContain("else 'BUSINESS_EMAIL_REQUIRED'");
    expect(recoveryMigration).not.toMatch(/return jsonb_build_object\([\s\S]*companyName|expectedEmail/i);
  });

  it("permits orphan rebind only through the locked atomic non-operational contract", () => {
    expect(recoveryMigration).toContain("private.is_non_operational_phone_orphan_v1");
    expect(recoveryMigration).toContain("pg_advisory_xact_lock(hashtextextended(p_phone_key_hash");
    expect(recoveryMigration).toContain("complete_quick_auth_orphan_rebind_v1");
    expect(recoveryMigration).toContain("update auth.identities");
    expect(recoveryMigration).toContain("ORPHAN_PHONE_DETACHED");
    expect(recoveryMigration).toContain("BUSINESS_PHONE_REBOUND");
    expect(recoveryMigration).not.toMatch(/otp_code|raw_otp|session_token|access_token|refresh_token/i);
  });

  it("keeps recovery audit immutable and browser inaccessible", () => {
    expect(recoveryMigration).toContain("before update or delete on public.business_quick_auth_audit_events");
    expect(recoveryMigration).toContain("force row level security");
    expect(recoveryMigration).toContain("grant select, insert on table public.business_quick_auth_audit_events to service_role");
    expect(recoveryMigration).not.toMatch(/grant\s+(?:select|insert|update|delete).*business_quick_auth_audit_events\s+to\s+(?:anon|authenticated)/i);
  });

  it("keeps Profile phone conflict resolution server-only and PII-free", () => {
    expect(profilePhoneStateMigration).toContain("private.normalize_moldova_phone_e164_v1(profile.phone) = p_phone_e164");
    expect(profilePhoneStateMigration).toContain("private.is_non_operational_phone_orphan_v1");
    expect(profilePhoneStateMigration).toContain("revoke all on function public.has_business_profile_phone_operational_conflict_v2(uuid, text)");
    expect(profilePhoneStateMigration).toContain("grant execute on function public.has_business_profile_phone_operational_conflict_v2(uuid, text)");
    expect(profilePhoneStateMigration).not.toMatch(/return.*(?:email|user_id|identity_data)/i);
  });
});

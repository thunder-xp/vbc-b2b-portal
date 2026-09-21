import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260921143000_business_phone_fleet_canonicalization.sql"),
  "utf8",
);

describe("Business phone fleet canonicalization migration", () => {
  it("normalizes supported Moldova forms and rejects impossible persisted state", () => {
    expect(migration).toContain("^00373[0-9]{8}$");
    expect(migration).toContain("user_profiles_phone_canonical_moldova_e164");
    expect(migration).toContain("private.normalize_moldova_phone_e164_v1(phone) is not null");
    expect(migration).toContain("phone = private.normalize_moldova_phone_e164_v1(phone)");
    expect(migration).toContain("not valid");
  });

  it("repairs only canonical-equivalent active B2B profile values", () => {
    expect(migration).toContain("private.has_active_business_access_v1(profile.id)");
    expect(migration).toContain("private.normalize_moldova_phone_e164_v1(profile.phone) is not null");
    expect(migration).not.toMatch(/phone_confirmed_at\s*=|set\s+phone\s*=\s*'\+373/i);
  });

  it("keeps diagnostics masked, bounded, and Admin-only", () => {
    expect(migration).toContain("public.has_internal_permission('admin.integrations.view')");
    expect(migration).toContain("'+373******' || right(fleet.profile_e164, 3)");
    expect(migration).toContain("least(coalesce(p_limit, 50), 100)");
    expect(migration).toContain("to authenticated");
    expect(migration).not.toMatch(/'otp'\s*,|otp_plaintext|raw_phone/i);
  });

  it("classifies every required fleet and failure state", () => {
    for (const state of [
      "VERIFIED_HEALTHY", "NO_PHONE", "PENDING_VERIFICATION", "AUTH_PROFILE_PHONE_MISMATCH",
      "VERIFIED_STATE_MISMATCH", "MALFORMED_PHONE", "DUPLICATE_PHONE", "STALE_PENDING_CHALLENGE",
      "STALE_RATE_LIMIT", "RECENT_DELIVERY_FAILURE", "ORPHANED_AUTH_PHONE", "ORPHANED_PROFILE_PHONE",
      "AUTH_CHALLENGE_CREATE", "AUTH_RESEND", "PROVIDER_REJECTED", "VERIFICATION",
    ]) expect(migration).toContain(state);
  });
});

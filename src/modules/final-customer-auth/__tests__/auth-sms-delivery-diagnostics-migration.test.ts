import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260920205500_auth_sms_delivery_diagnostics.sql"),
  "utf8",
);

describe("Auth SMS delivery diagnostics migration", () => {
  it("stores only pseudonymous, bounded delivery evidence", () => {
    expect(migration).toContain("phone_key_hash text not null");
    expect(migration).toContain("recipient_suffix text not null");
    expect(migration).toContain("attempt_count integer not null default 0");
    expect(migration).toContain("attempt_count between 0 and 3");
    expect(migration).toContain("correlation_id uuid not null unique");
    expect(migration).not.toMatch(/\b(?:otp|raw_phone|access_token|refresh_token|authorization_header)\s+(?:text|varchar|jsonb)/i);
  });

  it("keeps direct browser access closed and service mutations privileged", () => {
    expect(migration).toContain("alter table public.auth_sms_delivery_attempts force row level security");
    expect(migration).toContain("revoke all on table public.auth_sms_delivery_attempts from public, anon, authenticated, service_role");
    expect(migration).toContain("grant select, insert, update on table public.auth_sms_delivery_attempts to service_role");
    expect(migration).not.toMatch(/grant\s+(?:select|insert|update|delete).*auth_sms_delivery_attempts\s+to\s+(?:anon|authenticated)/i);
  });

  it("provides idempotent service-role operations and guarded Admin diagnostics", () => {
    expect(migration).toContain("on conflict (correlation_id) do nothing");
    expect(migration).toContain("attempt.attempt_count < 3");
    expect(migration).toContain("record_business_phone_enrollment_verification_result_v1");
    expect(migration).toContain("public.has_internal_permission('admin.integrations.view')");
    expect(migration).toContain("grant execute on function public.get_admin_auth_sms_diagnostics_v1(integer) to authenticated");
    expect(migration).toContain("grant execute on function public.begin_auth_sms_delivery_attempt_v1");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("'maskedTarget', '+373*****' || attempt.recipient_suffix");
    expect(migration).not.toMatch(/'otp'\s*,|otpPlaintext|otpCode/i);
  });
});

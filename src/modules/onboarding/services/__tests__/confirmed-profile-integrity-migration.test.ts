import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261111120000_onboarding_confirmed_profile_integrity.sql"),
  "utf8",
);

describe("confirmed Auth profile integrity migration", () => {
  it("serializes idempotent recovery and keeps identity server-owned", () => {
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended(p_auth_user_id::text, 0))");
    expect(sql).toContain("from auth.users identity");
    expect(sql).toContain("identity.email_confirmed_at");
    expect(sql).toContain("lower(v_profile.email) <> v_auth_email");
    expect(sql).toContain("select request.* into v_request");
    expect(sql).toContain("if not found then");
  });

  it("requires exact fiscal and stable 1C identity without creating commercial access", () => {
    expect(sql).toContain("counterparty.normalized_fiscal_code = v_normalized_fiscal");
    expect(sql).toContain("lower(counterparty.external_1c_id) = lower(btrim(p_counterparty_external_1c_id))");
    expect(sql).toContain("if v_counterparty_count <> 1 then");
    expect(sql).not.toMatch(/insert into public\.partner_companies/i);
    expect(sql).not.toMatch(/insert into public\.company_memberships/i);
    expect(sql).toContain("'pending_review',\n      'received'");
    expect(sql).not.toMatch(/confirmed_counterparty_id\s*[,)]/i);
  });

  it("publishes only a bounded aggregate orphan diagnostic", () => {
    expect(sql).toContain("'confirmedAuthWithoutProfile'");
    expect(sql).toContain("left join public.user_profiles profile on profile.id = identity.id");
    expect(sql).toContain("profile.id is null");
    expect(sql).not.toContain("identity.email,");
  });

  it("keeps recovery permission gated and unauthenticated callers revoked", () => {
    expect(sql).toContain("has_internal_permission('onboarding.requests.review')");
    expect(sql).toContain("from public, anon, authenticated, service_role");
    expect(sql).toContain("to authenticated");
  });
});

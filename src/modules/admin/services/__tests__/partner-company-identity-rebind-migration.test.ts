import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260917071851_partner_duplicate_company_identity_rebind.sql",
  ),
  "utf8",
).replace(/\r\n/g, "\n");

const onboardingGuard = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260911075130_onboarding_physical_person_status_validation.sql",
  ),
  "utf8",
).replace(/\r\n/g, "\n");

describe("partner company canonical identity rebind", () => {
  it("preserves the portal company, membership, active selection, and owned rows in place", () => {
    expect(migration).toContain("IN_PLACE_PORTAL_COMPANY_REBIND");
    expect(migration).toContain("'physicalForeignKeyUpdates', 0");
    expect(migration).toMatch(
      /update public\.partner_companies[\s\S]*external_1c_id = lower\(canonical_counterparty\.external_1c_id\)/,
    );
    expect(migration).not.toMatch(/update public\.company_memberships\s+set\s+company_id/i);
    expect(migration).not.toMatch(/update public\.estimates\s+set\s+company_id/i);
    expect(migration).not.toMatch(/update public\.partner_orders\s+set\s+company_id/i);
    expect(migration).not.toMatch(/update public\.partner_order_history\s+set\s+company_id/i);
    expect(migration).not.toMatch(/update public\.user_company_context_preferences/i);
  });

  it("requires the two current 1C identities to share the governed fiscal identity", () => {
    expect(migration).toContain("source.is_published");
    expect(migration).toContain("target.is_published");
    expect(migration).toContain("duplicate_counterparty.normalized_fiscal_code is distinct from normalized_expected_fiscal");
    expect(migration).toContain("canonical_counterparty.normalized_fiscal_code is distinct from normalized_expected_fiscal");
    expect(migration).toContain("canonical_counterparty.is_active");
    expect(migration).toContain("canonical_counterparty.is_deleted");
    expect(migration).toContain("Canonical 1C counterparty is already linked to another portal company.");
  });

  it("serializes concurrent attempts and is idempotent", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("for update");
    expect(migration).toContain("where event.operation_key = p_operation_key");
    expect(migration).toContain("'code', 'ALREADY_MERGED'");
    expect(migration).toContain("governed merge evidence is missing");
  });

  it("refreshes canonical commercial truth without changing immutable business history", () => {
    expect(migration).toContain("reconcile_partner_company_commercial_profiles_from_directory");
    expect(migration).toContain("canonical_counterparty.sync_id");
    expect(migration).not.toMatch(/update public\.access_requests[\s\S]*requested_external_1c_id/i);
    expect(migration).not.toMatch(/update public\.partner_order_history[\s\S]*source_counterparty_1c_id/i);
    expect(migration).not.toContain("http_");
  });

  it("emits one append-only governed merge event with correlation and preserved counts", () => {
    expect(migration).toContain("'rebind_company_identity'");
    expect(migration).toContain("'eventType', 'PARTNER_COMPANY_MERGED'");
    expect(migration).toContain("'duplicateCounterpartyRef'");
    expect(migration).toContain("'canonicalCounterpartyRef'");
    expect(migration).toContain("'preservedReferenceCounts'");
    expect(migration).toContain("p_correlation_id");
  });

  it("is service-role only and validates an active internal actor", () => {
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain("set row_security = off");
    expect(migration).toContain("profile.user_type in ('internal', 'admin')");
    expect(migration).toMatch(
      /revoke all on function public\.rebind_partner_company_to_canonical_counterparty\([\s\S]*from public, anon, authenticated/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.rebind_partner_company_to_canonical_counterparty\([\s\S]*to service_role/,
    );
  });
});

describe("stable fiscal identity duplicate prevention", () => {
  it("fails onboarding closed when the current 1C directory has multiple fiscal matches", () => {
    expect(onboardingGuard).toContain("candidate.normalized_fiscal_code = nullif(normalized_fiscal, '')");
    expect(onboardingGuard).toContain("if fiscal_matches > 1 then");
    expect(onboardingGuard).toContain("duplicate_company_conflict");
    expect(onboardingGuard).not.toMatch(/candidate\.normalized_name\s*=\s*/);
  });
});

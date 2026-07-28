import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260728170000_atomic_partner_access_approval.sql",
  ),
  "utf8",
).toLowerCase();

describe("atomic partner access approval migration", () => {
  it("uses one security-definer transaction with the canonical permission", () => {
    expect(migration).toContain(
      "create or replace function public.approve_partner_access_request_v2",
    );
    expect(migration).toContain(
      "public.has_internal_permission('access_requests.approve')",
    );
    expect(migration).toContain("set row_security = off");
  });

  it("locks the request and selected company identity", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toMatch(
      /from public\.access_requests request[\s\S]*?for update/,
    );
    expect(migration).toMatch(
      /from public\.partner_companies company[\s\S]*?for update/,
    );
  });

  it("accepts the external onboarding profile before activating it", () => {
    expect(migration).toContain(
      "target_profile.user_type not in ('external', 'partner')",
    );
    expect(migration).toMatch(
      /update public\.user_profiles[\s\S]*?user_type = 'partner'[\s\S]*?insert into public\.company_memberships/,
    );
  });

  it("prevents duplicate companies and conflicting commercial mappings", () => {
    expect(migration).toContain(
      "where lower(company.external_1c_id) = normalized_partner_ref",
    );
    expect(migration).toContain("approval_company_conflict");
    expect(migration).toContain(
      "coalesce(external_1c_price_type_id, normalized_price_type_ref)",
    );
  });

  it("creates the first owner and preserves an existing owner", () => {
    expect(migration).toContain("role.code = 'partner_owner'");
    expect(migration).toContain("role.code = 'partner_manager'");
    expect(migration).toContain("membership.role_id = owner_role.id");
    expect(migration).toContain("assigned_role := manager_role");
  });

  it("creates or restores one membership without duplicates", () => {
    expect(migration).toMatch(
      /from public\.company_memberships membership[\s\S]*?for update/,
    );
    expect(migration).toContain("membership_outcome := 'created'");
    expect(migration).toContain("membership_outcome := 'restored'");
    expect(migration).toContain("membership_outcome := 'existing'");
  });

  it("writes audit before the final request transition in the same transaction", () => {
    const audit = migration.indexOf("insert into public.company_user_events");
    const approval = migration.lastIndexOf("update public.access_requests");

    expect(audit).toBeGreaterThan(-1);
    expect(approval).toBeGreaterThan(audit);
    expect(migration).toContain("'operation', 'partner_access_approved'");
    expect(migration).toContain("'correlation_id', p_correlation_id");
  });

  it("supports idempotent retry of a complete approval", () => {
    expect(migration).toContain("'idempotent', true");
    expect(migration).toContain("target_request.status = 'approved'");
  });

  it("validates fiscal code and non-zero 1C GUIDs", () => {
    expect(migration).toContain("approval_fiscal_code_required");
    expect(migration).toContain(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(migration).toContain("approval_1c_binding_invalid");
  });

  it("keeps partner writes behind authenticated execution and RLS", () => {
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated");
    expect(migration).not.toMatch(
      /grant execute on function[\s\S]*?to (public|anon)/,
    );
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260726150000_unified_admin_control_center_slice1.sql",
  ),
  "utf8",
);

describe("unified admin internal role migration", () => {
  it("enforces one active primary internal role and preserves audit history", () => {
    expect(migration).toContain(
      "create table if not exists public.internal_user_role_assignments",
    );
    expect(migration).toContain(
      "internal_user_role_assignments_one_active_idx",
    );
    expect(migration).toContain("where revoked_at is null");
    expect(migration).toContain(
      "create table if not exists public.internal_role_assignment_audit_events",
    );
    expect(migration).toContain("A revoked internal role assignment is immutable.");
  });

  it("rejects partner roles and inactive internal profiles", () => {
    expect(migration).toContain("target_profile.status <> 'active'");
    expect(migration).toContain(
      "target_profile.user_type not in ('internal', 'admin')",
    );
    expect(migration).toContain("target_role.scope <> 'internal'");
  });

  it("projects permissions from auth uid without a partner company", () => {
    const projection = migration.match(
      /create or replace function public\.get_effective_internal_permissions\(\)[\s\S]*?\$\$;/,
    )?.[0];

    expect(projection).toBeDefined();
    expect(projection).toContain("profile.id = auth.uid()");
    expect(projection).toContain("assignment.revoked_at is null");
    expect(projection).not.toContain("company_memberships");
    expect(projection).not.toContain("p_user_id");
    expect(projection).not.toContain("p_company_id");
  });

  it("fails closed and exposes no direct authenticated writes", () => {
    expect(migration).toContain(
      "revoke all on table public.internal_user_role_assignments",
    );
    expect(migration).not.toMatch(
      /grant\s+(insert|update|delete)[\s\S]*internal_user_role_assignments[\s\S]*authenticated/i,
    );
    expect(migration).toContain(
      "grant execute on function public.get_effective_internal_permissions()",
    );
  });

  it("reuses domain mutation permissions through the canonical projection", () => {
    expect(migration).toContain(
      "public.has_internal_permission('access_requests.approve')",
    );
    expect(migration).toContain(
      "public.has_internal_permission('commercial_rates.manage')",
    );
    expect(migration).toContain(
      "public.has_internal_permission('specifications.review')",
    );
    expect(migration).toContain(
      "public.has_internal_permission('reservations.review')",
    );
    expect(migration).toContain(
      "public.has_internal_permission('order_date_changes.review')",
    );
  });
});

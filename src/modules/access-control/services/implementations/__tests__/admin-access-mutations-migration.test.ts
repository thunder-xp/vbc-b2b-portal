import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260726164000_admin_access_mutations.sql",
  ),
  "utf8",
).toLowerCase();

describe("admin access mutation migration", () => {
  it("requires a bounded reason for every sensitive versioned mutation", () => {
    expect(sql).toContain("char_length(normalized_reason) not between 3 and 500");
    expect(sql.match(/require_access_change_reason\(p_reason\)/g)).toHaveLength(7);
  });

  it("protects the final active partner owner", () => {
    expect(sql).toContain("the final active owner cannot be suspended");
    expect(sql).toContain("ownership must be transferred atomically");
    expect(sql).toContain("use atomic ownership transfer");
  });

  it("transfers ownership under a company lock without an ownerless state", () => {
    const transfer = sql.slice(
      sql.indexOf("create or replace function public.transfer_company_owner_v2"),
      sql.indexOf("create or replace function public.revoke_company_invitation_v2"),
    );
    expect(transfer).toContain("pg_advisory_xact_lock");
    expect(transfer.indexOf("set role_id = owner_role_id")).toBeLessThan(
      transfer.indexOf("set role_id = manager_role_id"),
    );
    expect(transfer).toContain("'owner_transferred'");
  });

  it("restricts protected permission overrides to platform permission managers", () => {
    expect(sql).toContain(
      "public.has_internal_permission('admin.permissions.manage')",
    );
    expect(sql).toContain("protected permission override is not allowed");
  });

  it("does not grant direct table writes", () => {
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete|all)\s+on\s+(table\s+)?public\.(company_memberships|membership_permission_overrides|invitations)/,
    );
  });

  it("allows canonical internal managers without weakening partner scoping", () => {
    expect(sql).toContain(
      "public.has_internal_permission('company_users.manage')",
    );
    expect(sql).toContain(
      "public.has_permission(p_company_id, 'company_users.manage')",
    );
  });

  it("never assigns an internal role to a partner profile", () => {
    expect(sql).toContain(
      "target_profile.user_type not in ('internal', 'admin')",
    );
    expect(sql).toContain("target_profile.status <> 'active'");
    expect(sql).toContain("role.scope = 'internal'");
  });
});

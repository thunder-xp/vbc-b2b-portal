import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260726162000_admin_users_and_invitations.sql",
  ),
  "utf8",
);

describe("admin identity directory migration", () => {
  it("guards global user and invitation projections independently", () => {
    expect(sql).toContain(
      "public.has_internal_permission('admin.users.view')",
    );
    expect(sql).toContain(
      "public.has_internal_permission('admin.invitations.view')",
    );
    expect(sql.match(/count\(\*\) over\(\)/g)).toHaveLength(2);
  });

  it("keeps partner memberships separate from internal assignments", () => {
    expect(sql).toContain("internal_user_role_assignments");
    expect(sql).toContain("company_memberships");
    expect(sql).toContain(
      "profile.user_type in ('internal', 'admin')",
    );
    expect(sql).toContain("role.code = 'partner_owner'");
  });

  it("does not return invitation token material", () => {
    const invitationReturn = sql.match(
      /create or replace function public\.list_admin_invitations[\s\S]*?language plpgsql/,
    )?.[0];
    expect(invitationReturn).toBeDefined();
    expect(invitationReturn).not.toMatch(/token|token_hash/i);
  });

  it("uses aggregate queries without Auth Admin or direct writes", () => {
    expect(sql).not.toMatch(/auth\.users|admin\.listUsers/i);
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)/i);
    expect(sql).toContain("limit normalized_page_size");
    expect(sql).toContain(
      "offset (normalized_page - 1) * normalized_page_size",
    );
  });
});

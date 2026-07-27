import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260727091000_internal_roles_company_management_bridge.sql",
  ),
  "utf8",
);

describe("internal company-management permission bridge", () => {
  it("uses the canonical internal permission projection", () => {
    expect(sql).toContain("public.get_effective_internal_permissions()");
    expect(sql).toContain("context.effective_permission_codes");
    expect(sql).toContain("internal_permission_codes");
  });

  it("does not create or require a partner membership for internal users", () => {
    expect(sql).toContain("null::uuid");
    expect(sql).toContain("is_internal_override boolean");
    expect(sql).not.toMatch(
      /insert\s+into\s+public\.company_memberships/i,
    );
  });

  it("still requires an active target company", () => {
    expect(sql).toContain("company.status = 'active'");
    expect(sql).toContain("company.id = p_company_id");
  });

  it("preserves partner membership permission resolution", () => {
    expect(sql).toContain("membership.user_id = target_user.id");
    expect(sql).toContain("membership.status = 'active'");
    expect(sql).toContain("permission.scope in ('partner', 'both')");
    expect(sql).toContain("select unnest(denied_codes)");
  });
});

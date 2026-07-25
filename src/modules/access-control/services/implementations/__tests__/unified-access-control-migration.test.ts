import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    "supabase/migrations/20260725210000_unified_access_control_foundation.sql",
  ),
  "utf8",
);

describe("unified access-control migration", () => {
  it("adds normalized membership overrides and permission delegation metadata", () => {
    expect(sql).toContain("create table if not exists public.membership_permission_overrides");
    expect(sql).toContain("unique (membership_id, permission_id)");
    expect(sql).toContain("check (effect in ('allow', 'deny'))");
    expect(sql).toContain("delegable_by_partner_owner");
    expect(sql).toContain("sensitive");
    expect(sql).toContain("category");
  });

  it("creates explicit partner and retail price capabilities", () => {
    expect(sql).toContain("'pricing.partner_price.view'");
    expect(sql).toContain("'pricing.retail_price.view'");
    expect(sql).toContain("Legacy prices.view is intentionally not delegable");
  });

  it("requires active tenant context and applies explicit deny last", () => {
    expect(sql).toContain("profile.status = 'active'");
    expect(sql).toContain("company.status = 'active'");
    expect(sql).toContain("membership.status = 'active'");
    expect(sql).toContain("except");
    expect(sql).toContain("select unnest(denied_codes)");
  });

  it("keeps the protected override limited to active Novotech admins", () => {
    expect(sql).toContain("target_user.user_type = 'admin'");
    expect(sql).not.toContain("target_user.user_type in ('internal', 'admin')");
  });

  it("keeps direct authenticated override writes denied", () => {
    expect(sql).toContain(
      "revoke all on table public.membership_permission_overrides from anon, authenticated",
    );
    expect(sql).toContain(
      "grant select on table public.membership_permission_overrides to authenticated",
    );
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete|all).*membership_permission_overrides.*authenticated/i,
    );
  });

  it("makes the existing RLS helper consume the canonical projection", () => {
    expect(sql).toContain("public.get_effective_company_permissions(company)");
    expect(sql).toContain(
      "permission_code = any(context.effective_permission_codes)",
    );
  });
});

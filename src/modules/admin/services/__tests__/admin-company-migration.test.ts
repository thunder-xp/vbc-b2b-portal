import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260726161000_admin_company_directory.sql",
  ),
  "utf8",
);

describe("admin company directory migration", () => {
  it("uses one paginated aggregate guarded by company-view permission", () => {
    expect(sql).toContain("function public.list_admin_companies");
    expect(sql).toContain(
      "public.has_internal_permission('admin.companies.view')",
    );
    expect(sql).toContain("count(*) over()");
    expect(sql).toContain("limit normalized_page_size");
    expect(sql).toContain(
      "offset (normalized_page - 1) * normalized_page_size",
    );
  });

  it("aggregates memberships, owners, invitations, finance, and commercial freshness", () => {
    expect(sql).toContain("membership_counts as");
    expect(sql).toContain("invitation_counts as");
    expect(sql).toContain("partner_finance_sync_state");
    expect(sql).toContain("price_freshness as");
    expect(sql).toContain("role.code = 'partner_owner'");
  });

  it("returns no confidential finance amount and performs no live integration", () => {
    expect(sql).not.toMatch(/debt|credit_limit|balance_amount|overdue_amount/i);
    expect(sql).not.toMatch(/http|fetch|one_c_provider/i);
  });

  it("supports bounded search and all accepted filters", () => {
    expect(sql).toContain("left(btrim(coalesce(p_search, '')), 100)");
    for (const filter of [
      "active",
      "pending_access",
      "missing_1c_mapping",
      "no_active_owner",
      "suspended",
      "finance_sync_failed",
      "commercial_data_stale",
    ]) {
      expect(sql).toContain(`'${filter}'`);
    }
  });

  it("keeps read access behind RPCs without direct write grants", () => {
    expect(sql).toContain(
      "revoke all on function public.list_admin_companies(integer, integer, text, text)",
    );
    expect(sql).toContain(
      "grant execute on function public.get_admin_company_overview(uuid)",
    );
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)/i);
  });
});

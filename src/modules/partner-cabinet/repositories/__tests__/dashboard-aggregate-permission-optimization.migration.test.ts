import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261007212607_optimize_dashboard_aggregate_permission_resolution.sql",
  ),
  "utf8",
);

function functionBody(version: 2 | 3 | 7): string {
  const body = sql.match(
    new RegExp(
      `create or replace function public\\.get_partner_workspace_dashboard_v${version}\\([\\s\\S]*?\\n\\$\\$;`,
    ),
  )?.[0];
  if (!body) throw new Error(`Dashboard v${version} body is missing.`);
  return body;
}

describe("dashboard aggregate permission-resolution optimization migration", () => {
  it("resolves the canonical effective permissions once in each aggregate layer", () => {
    for (const version of [2, 3, 7] as const) {
      const body = functionBody(version);
      expect(body.match(/get_effective_company_permissions\(p_company_id\)/g)).toHaveLength(1);
      expect(body).not.toContain("public.has_permission(p_company_id");
    }
  });

  it("preserves the security-definer membership and least-privilege boundaries", () => {
    for (const version of [2, 3, 7] as const) {
      const body = functionBody(version);
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = public");
      expect(body).toContain("set row_security = off");
      expect(body).toContain("public.has_active_company_membership(p_company_id)");
    }
    expect(sql.match(/grant execute on function public\.get_partner_workspace_dashboard_v[237]\(uuid\) to authenticated/g)).toHaveLength(3);
    expect(sql).not.toMatch(/grant execute[^;]+\bto\s+(?:anon|public)\b/i);
  });

  it("keeps the v7 source, date, period, and currency semantics unchanged", () => {
    const v7 = functionBody(7);
    expect(v7).toContain("public.get_partner_workspace_dashboard_v5(p_company_id)");
    expect(v7).toContain("(now() at time zone 'Europe/Chisinau')::date");
    expect(v7).toContain("(30, business_date - 29");
    expect(v7).toContain("(60, business_date - 59");
    expect(v7).toContain("(90, business_date - 89");
    expect(v7).toContain("(180, business_date - 179");
    expect(v7).toContain("history.company_id = p_company_id");
    expect(v7).toContain("history.partner_visible");
    expect(v7).toContain("history.one_c_posted");
    expect(v7).toContain("not history.one_c_deletion_mark");
    expect(v7).toContain("group by currencies.currency, periods.days");
  });

  it("remains a read-only local projection and creates no index", () => {
    expect(sql).not.toMatch(/\bcreate\s+(?:unique\s+)?index\b/i);
    expect(sql).not.toMatch(/\b(?:insert\s+into|update\s+public\.|delete\s+from|merge\s+into)\b/i);
    expect(sql).not.toMatch(/\b(?:http_get|http_post|net\.http|one_c_provider|InformationRegister_)\b/i);
  });
});

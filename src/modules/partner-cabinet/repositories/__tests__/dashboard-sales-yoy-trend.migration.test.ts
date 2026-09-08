import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260908191616_partner_dashboard_sales_yoy_trend.sql"),
  "utf8",
);

describe("partner Dashboard Sales YoY trend migration", () => {
  it("extends the single aggregate without rescanning the v6 Sales path", () => {
    expect(sql).toContain("get_partner_workspace_dashboard_v7");
    expect(sql).toContain("get_partner_workspace_dashboard_v5(p_company_id)");
    expect(sql).not.toContain("get_partner_workspace_dashboard_v6(p_company_id)");
    expect(sql.match(/from public\.partner_order_history history/g)).toHaveLength(1);
    expect(sql).toContain("eligible_orders as materialized");
  });

  it("uses the canonical Chisinau business date and exact rolling boundaries", () => {
    expect(sql).toContain("(now() at time zone 'Europe/Chisinau')::date");
    expect(sql).toContain("(30, business_date - 29");
    expect(sql).toContain("(60, business_date - 59");
    expect(sql).toContain("(90, business_date - 89");
    expect(sql).toContain("(180, business_date - 179");
    expect(sql).toContain("interval '1 year'");
    expect(sql).toContain("source_start := least(");
    expect(sql).toContain("history.one_c_document_date < ((business_date + 1)::timestamp at time zone 'Europe/Chisinau')");
  });

  it("keeps exact governed source predicates and currency isolation", () => {
    expect(sql).toContain("history.company_id = p_company_id");
    expect(sql).toContain("history.partner_visible");
    expect(sql).toContain("history.one_c_posted");
    expect(sql).toContain("not history.one_c_deletion_mark");
    expect(sql).toContain("group by currencies.currency, periods.days");
    expect(sql).not.toMatch(/partner_carts|estimate|opportunit|crm/i);
  });

  it("preserves membership, permission and least-privilege boundaries", () => {
    expect(sql).toContain("public.has_active_company_membership(p_company_id)");
    expect(sql).toContain("public.has_permission(p_company_id, 'orders.view')");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("set row_security = off");
    expect(sql).toContain("revoke all on function public.get_partner_workspace_dashboard_v7(uuid)");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to authenticated");
  });

  it("adds no live 1C, finance communication, or outbound path", () => {
    expect(sql).not.toMatch(/http_|net\.http|InformationRegister_|FINANCE_REMINDER|sms_gateway/i);
  });
});

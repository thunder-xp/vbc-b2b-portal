import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260908182557_partner_dashboard_finance_sales_split.sql"),
  "utf8",
);

describe("partner Dashboard Finance/Sales split migration", () => {
  it("extends the one existing Dashboard aggregate with twelve bounded months", () => {
    expect(sql).toContain("get_partner_workspace_dashboard_v6");
    expect(sql).toContain("get_partner_workspace_dashboard_v5(p_company_id)");
    expect(sql).toContain("interval '11 months'");
    expect(sql).toContain("date_trunc('month', current_date)");
    expect(sql).toContain("jsonb_set(result, '{salesAnalytics}'");
  });

  it("uses only authoritative posted company order history", () => {
    expect(sql).toContain("from public.partner_order_history history");
    expect(sql).toContain("history.company_id = p_company_id");
    expect(sql).toContain("history.partner_visible");
    expect(sql).toContain("history.one_c_posted");
    expect(sql).toContain("not history.one_c_deletion_mark");
    expect(sql).not.toMatch(/partner_carts|estimate|opportunit/i);
  });

  it("separates currencies and preserves the established tenant boundary", () => {
    expect(sql).toContain("group by orders.currency");
    expect(sql).toContain("group by orders.month, orders.currency");
    expect(sql).toContain("public.has_active_company_membership(p_company_id)");
    expect(sql).toContain("public.has_permission(p_company_id, 'orders.view')");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("revoke all on function public.get_partner_workspace_dashboard_v6(uuid)");
    expect(sql).toContain("from public, anon");
    expect(sql).toContain("to authenticated");
  });

  it("adds no live 1C or outbound path", () => {
    expect(sql).not.toMatch(/http_|net\.http|Document_[A-Za-zА-Я]|InformationRegister_|FINANCE_REMINDER/);
  });
});

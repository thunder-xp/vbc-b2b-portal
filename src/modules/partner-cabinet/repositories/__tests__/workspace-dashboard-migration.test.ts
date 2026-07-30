import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260730113000_partner_workspace_operational_dashboard.sql",
  ),
  "utf8",
);

describe("partner workspace dashboard migration", () => {
  it("keeps the aggregate tenant-bound, read-only, and permission-aware", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("public.has_active_company_membership(p_company_id)");
    expect(sql).toContain("public.has_permission(p_company_id");
    expect(sql).toContain("revoke all on function public.get_partner_workspace_dashboard_v2(uuid)");
    expect(sql).not.toMatch(/\b(insert|update|delete)\s+(into|public\.|from)/i);
  });

  it("uses local bounded projections without live integration calls", () => {
    expect(sql).toContain("from public.partner_order_history history");
    expect(sql).toContain("from public.partner_contract_balances balance");
    expect(sql).toContain("from public.product_merchandising_assignments assignment");
    expect(sql).toContain("limit 8");
    expect(sql).toContain("limit 4");
    expect(sql).not.toMatch(/one_c_provider|http_|net\.http|Document_|InformationRegister_/);
  });

  it("unifies unsynchronized portal orders without duplicate history records", () => {
    expect(sql).toContain("recent_portal_orders as");
    expect(sql).toContain("where history.portal_order_id = portal_order.id");
    expect(sql).toContain("recent_orders as");
  });

  it("requires repeat purchase history and deterministic ranking", () => {
    expect(sql).toContain("having count(distinct history.id) >= 2");
    expect(sql).toContain("count(distinct history.id) desc");
    expect(sql).toContain("max(history.one_c_document_date) desc");
    expect(sql).toContain("item.product_id");
  });
});

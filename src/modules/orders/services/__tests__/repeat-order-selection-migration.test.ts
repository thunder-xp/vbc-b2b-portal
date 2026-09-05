import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20260905190655_partner_repeat_order_to_live_selection.sql",
), "utf8");

describe("repeat order selection SQL contract", () => {
  it("limits eligible history to company-private reliable completed orders", () => {
    expect(sql).toContain("history.company_id = p_company_id");
    expect(sql).toContain("history.one_c_state_code = 'completed'");
    expect(sql).toContain("history.origin_type <> 'internal_1c'");
    expect(sql).toContain("history.one_c_document_date <= now()");
    expect(sql).toContain("history.position_count > 0");
    expect(sql).toContain("limit 50");
  });

  it("requires membership plus order and catalog permissions and denies public/anon", () => {
    expect(sql).toContain("public.has_active_company_membership");
    expect(sql).toContain("public.has_permission(p_company_id, 'orders.view')");
    expect(sql).toContain("public.has_permission(p_company_id, 'catalog.view')");
    expect(sql).toContain("public.has_permission(source_order.company_id, 'orders.view')");
    expect(sql).toContain("public.has_permission(source_order.company_id, 'catalog.view')");
    expect(sql).toContain("from public, anon");
    expect(sql).toContain("to authenticated");
    expect(sql).toContain("set search_path = ''");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260907210547_partner_repeat_history_category_filters.sql"), "utf8");

describe("repeat history category filters migration", () => {
  it("adds one bounded multi-category RPC with OR semantics", () => {
    expect(sql).toContain("get_partner_previously_purchased_products_v3");
    expect(sql).toContain("p_category_ids uuid[]");
    expect(sql).toContain("product.category_id = any(selected_category_ids)");
    expect(sql).toContain("coalesce(cardinality(p_category_ids), 0) > 50");
    expect(sql).toContain("'allCount', (select count(*) from historical_products)");
  });

  it("retains the existing membership/permission gate and minimal grants", () => {
    expect(sql).toContain("public.has_active_company_membership(p_company_id)");
    expect(sql).toContain("public.has_permission(p_company_id, 'orders.view')");
    expect(sql).toContain("public.has_permission(p_company_id, 'catalog.view')");
    expect(sql).toContain("security definer\nset search_path = ''");
    expect(sql).toContain("from public, anon");
    expect(sql).toContain("to authenticated");
    expect(sql).not.toMatch(/grant execute[\s\S]*to anon/i);
  });
});

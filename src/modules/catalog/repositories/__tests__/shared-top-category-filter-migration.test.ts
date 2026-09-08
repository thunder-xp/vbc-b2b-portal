import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260908055924_partner_shared_multi_category_filter_bar.sql"), "utf8");

describe("shared top-category filter migration", () => {
  it("extends the existing bounded Catalog array contracts without parallel page RPCs", () => {
    expect(sql).toContain("create or replace function public.catalog_partner_page_category_set_base");
    expect(sql).toContain("create or replace function public.catalog_partner_facets_v3");
    expect(sql).toContain("coalesce(cardinality(p_category_ids), 0) > 24");
    expect(sql).not.toContain("catalog_partner_page_v8");
  });

  it("evolves Repeat Purchase v3 to resolve descendants through canonical roots", () => {
    expect(sql).toContain("create or replace function public.get_partner_previously_purchased_products_v3");
    expect(sql).toContain("with recursive category_tree as");
    expect(sql).toContain("root_category.parent_id is null");
    expect(sql).toContain("product.root_category_id = any(selected_category_ids)");
    expect(sql).toContain("'external1cId', category.external_1c_id");
    expect(sql).not.toContain("product.category_id = any(selected_category_ids)");
  });

  it("retains company authorization, fixed search paths, and minimal grants", () => {
    expect(sql).toContain("public.has_active_company_membership(p_company_id)");
    expect(sql).toContain("public.has_permission(p_company_id, 'orders.view')");
    expect(sql).toContain("public.has_permission(p_company_id, 'catalog.view')");
    expect(sql.match(/security definer\nset search_path = ''/g)?.length).toBeGreaterThanOrEqual(3);
    expect(sql).not.toMatch(/grant execute[\s\S]*to anon/i);
  });
});

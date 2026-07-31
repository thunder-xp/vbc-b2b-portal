import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260731200000_purchase_templates.sql"), "utf8");

describe("purchase templates migration", () => {
  it("stores purchasing intent without commercial truth", () => {
    expect(sql).toContain("create table public.purchase_templates");
    expect(sql).toContain("create table public.purchase_template_items");
    expect(sql).toContain("unique (template_id, product_id)");
    const start = sql.indexOf("create table public.purchase_template_items");
    const table = sql.slice(start, sql.indexOf(");", start));
    expect(table).not.toMatch(/price|stock|arrival|currency/i);
  });

  it("uses narrow permissions, RLS, and no direct writes", () => {
    for (const permission of ["view", "create", "edit_own", "edit_company", "archive", "use"]) expect(sql).toContain(`purchase_templates.${permission}`);
    expect(sql).toContain("alter table public.purchase_templates enable row level security");
    expect(sql).toContain("target.visibility = 'company' or target.owner_user_id = auth.uid()");
    expect(sql).toContain("grant select on public.purchase_templates, public.purchase_template_items to authenticated");
    expect(sql).not.toMatch(/grant (insert|update|delete) on public\.purchase_template/i);
  });

  it("uses bounded aggregate listing and server-side search", () => {
    expect(sql).toContain("create or replace function public.list_purchase_templates_page");
    expect(sql).toContain("limit target_limit offset target_offset");
    expect(sql).toContain("product.sku ilike");
    expect(sql).toContain("jsonb_agg(jsonb_build_object('productId'");
  });

  it("deduplicates creation and cart execution atomically", () => {
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("group by row.product_id");
    expect(sql).toContain("on conflict (cart_id, product_id) do update");
    expect(sql).toContain("return prior.result || jsonb_build_object('repeated', true)");
  });

  it("indexes purchase templates without confidential commercial values", () => {
    expect(sql).toContain("'purchase_template'");
    expect(sql).toContain("public.has_permission(p_company_id, 'purchase_templates.view')");
    const projection = sql.slice(sql.indexOf("project_partner_search_purchase_template"));
    expect(projection).not.toMatch(/partner_price|retail_price|margin|amount/i);
  });
});

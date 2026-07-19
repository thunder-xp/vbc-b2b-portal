import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260720010000_quick_reorder_preview.sql"), "utf8");

describe("quick reorder preview migration", () => {
  it("scopes the snapshot to visible company orders and existing permissions", () => {
    expect(sql).toContain("partner_visible");
    expect(sql).toContain("not one_c_deletion_mark");
    expect(sql).toContain("has_permission(source_order.company_id, 'orders.view')");
    expect(sql).toContain("has_permission(source_order.company_id, 'cart.manage')");
  });

  it("returns one ordered line aggregate with current catalog state", () => {
    expect(sql).toContain("jsonb_agg");
    expect(sql).toContain("left join public.catalog_products product on product.id = item.product_id");
    expect(sql).toContain("current_is_active");
    expect(sql).toContain("current_is_visible");
  });

  it("allows no anonymous or broad table writes", () => {
    expect(sql).toContain("revoke all on function public.get_partner_order_reorder_source(uuid) from public, anon");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)/i);
  });
});

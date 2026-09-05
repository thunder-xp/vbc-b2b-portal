import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260905120000_live_commerce_selection_batch.sql"), "utf8");

describe("live commerce batch mutation migration", () => {
  it("keeps Cart company-scoped, authenticated, bounded, atomic, and set-based", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("public.can_manage_partner_order_company(target_company_id)");
    expect(sql).toContain("jsonb_array_length(target_items) > 50");
    expect(sql).toContain("jsonb_to_recordset(target_items)");
    expect(sql).toContain("on conflict (cart_id, product_id) do update");
    expect(sql).toContain("revoke all on function public.add_partner_cart_items(uuid, jsonb) from public, anon");
    expect(sql).toContain("grant execute on function public.add_partner_cart_items(uuid, jsonb) to authenticated");
  });

  it("widens only the existing Estimate entry boundary to a 1-50 product batch", () => {
    expect(sql).toContain("jsonb_array_length(line_items) < 1");
    expect(sql).toContain("jsonb_array_length(line_items) > 50");
    expect(sql).toContain("public.add_estimate_items_v2");
    expect(sql).toContain("where entry->>'line_type' <> 'product'");
  });
});

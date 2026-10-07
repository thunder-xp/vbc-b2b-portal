import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20261007144518_universal_b2b_cart_admission.sql"), "utf8");

describe("B2B purchasing-list cart admission migration", () => {
  it("admits all structurally valid demand and keeps shortage as evidence", () => {
    expect(sql).toContain("stock.freshness_state = 'authoritative'");
    expect(sql).toContain("stock.is_published");
    expect(sql).toContain("coalesce(existing.quantity, 0) + requested.quantity > stock.available_quantity");
    expect(sql).toContain("select target_cart.id, row.product_id, sum(row.quantity)::integer");
    expect(sql).not.toContain("where row.product_id = any(eligible_product_ids)");
  });

  it("serializes the canonical merge and reports no stock-based skips", () => {
    expect(sql).toContain("status = 'active'\n  for update");
    expect(sql).toContain("'insufficient_stock', insufficient_stock_count");
    expect(sql).toContain("'skipped', 0");
  });

  it("does not introduce price, FX, payment, checkout, MAIB or 1C decisions", () => {
    expect(sql).not.toMatch(/partner_price|exchange_rate|rtl999|maib|payment|one_c/i);
    expect(sql).toContain("grant execute on function public.merge_purchasing_list_into_cart");
    expect(sql).toContain("to authenticated");
  });
});

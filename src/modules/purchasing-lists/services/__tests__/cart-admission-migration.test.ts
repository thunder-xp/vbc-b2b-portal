import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20261005180000_b2b_cart_admission_stock_only.sql"), "utf8");

describe("B2B purchasing-list cart admission migration", () => {
  it("admits unknown stock and compares known stock with the final merged quantity", () => {
    expect(sql).toContain("stock.freshness_state = 'authoritative'");
    expect(sql).toContain("stock.is_published");
    expect(sql).toContain("coalesce(existing.quantity, 0) + requested.quantity as final_quantity");
    expect(sql).toContain("not stock_is_known or final_quantity <= available_quantity");
    expect(sql).toContain("where stock_is_known and final_quantity > available_quantity");
  });

  it("serializes the canonical merge and keeps valid kit positions partial", () => {
    expect(sql).toContain("status = 'active'\n  for update");
    expect(sql).toContain("where row.product_id = any(eligible_product_ids)");
    expect(sql).toContain("'insufficient_stock', insufficient_stock_count");
    expect(sql).toContain("'skipped', input_count - eligible_count");
  });

  it("does not introduce price, FX, payment, checkout, MAIB or 1C decisions", () => {
    expect(sql).not.toMatch(/partner_price|exchange_rate|rtl999|maib|payment|one_c/i);
    expect(sql).toContain("grant execute on function public.merge_purchasing_list_into_cart");
    expect(sql).toContain("to authenticated");
  });
});

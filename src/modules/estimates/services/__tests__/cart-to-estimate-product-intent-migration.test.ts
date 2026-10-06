import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20261006120000_cart_to_estimate_product_intent.sql"),
  "utf8",
);
const runtime = readFileSync(
  resolve("supabase/tests/cart_to_estimate_product_intent_runtime.sql"),
  "utf8",
);

describe("cart-to-estimate product-intent migration", () => {
  it("validates the complete product aggregate before any estimate write", () => {
    expect(migration).toContain("count(distinct item.product_id)");
    expect(migration).toContain("sum(item.quantity)::numeric as quantity");
    expect(migration).toContain("full join authoritative using (product_id)");
    expect(migration).toContain("submitted.quantity is distinct from authoritative.quantity");
    expect(migration.indexOf("Cart product aggregate is invalid.")).toBeLessThan(
      migration.indexOf("insert into public.estimates"),
    );
  });

  it("persists one authoritative quantity per product without a product-only cart join", () => {
    expect(migration).toContain("join authoritative using (product_id)");
    expect(migration).toContain("authoritative.quantity");
    expect(migration).not.toMatch(
      /join public\.cart_items\s+cart_item on cart_item\.cart_id = target_cart\.id and cart_item\.product_id = row\.product_id/i,
    );
  });

  it("checks current governed price evidence and writes catalog-owned identity", () => {
    expect(migration).toContain("candidate.external_1c_price_type_id = company.external_1c_price_type_id");
    expect(migration).toContain("partner_price is distinct from expected_partner_price");
    expect(migration).toContain("converted_price is distinct from expected_converted_price");
    expect(migration).toContain("product.sku");
    expect(migration).toContain("product.name");
  });

  it("keeps the authenticated RPC bounded and idempotent", () => {
    expect(migration).toContain("target_cart.created_by <> auth.uid()");
    expect(migration).toContain("submitted_line_count not between 1 and 500");
    expect(migration).toContain("prior.created_by <> auth.uid()");
    expect(migration).toContain("grant execute on function public.create_estimate_from_cart");
    expect(migration).toContain("to authenticated");
  });

  it("provides executable mixed-context, price, atomicity, and single-context checks", () => {
    for (const evidence of [
      "commercial_source = 'STANDARD' and quantity = 2",
      "commercial_source = 'CAMPAIGN' and quantity = 1",
      "product_id = product_two and commercial_source = 'CAMPAIGN' and quantity = 2",
      "product_id = product_one) <> 9.21",
      "product_id = product_two) <> 6",
      "Forged quantity was not rejected atomically",
      "Forged product was not rejected atomically",
      "Forged price was not rejected atomically",
      "Campaign-only cart-to-estimate behavior or governed repricing regressed",
      "Single-context STANDARD cart-to-estimate behavior regressed",
      "Distinct STANDARD product cart-to-estimate behavior regressed",
      "rollback;",
    ]) {
      expect(runtime).toContain(evidence);
    }
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260720020000_quick_reorder_cart_conversion.sql"), "utf8");

describe("quick reorder cart conversion migration", () => {
  it("uses one advisory-locked idempotency record and returns prior results", () => {
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("where request_key = target_request_key");
    expect(sql).toContain("prior.request_fingerprint <> target_request_fingerprint");
    expect(sql).toContain("'repeated', true");
    expect(sql.match(/insert into public\.order_reorder_attempts/g)).toHaveLength(1);
  });

  it("validates order ownership, permissions, selected line membership, and product state", () => {
    expect(sql).toContain("has_permission(source_order.company_id, 'orders.view')");
    expect(sql).toContain("has_permission(source_order.company_id, 'cart.manage')");
    expect(sql).toContain("can_manage_partner_order_company(source_order.company_id)");
    expect(sql).toContain("item.order_history_id = source_order.id");
    expect(sql).toContain("product.is_active and product.is_visible");
  });

  it("merges duplicate products and existing cart quantities in one statement", () => {
    expect(sql).toContain("group by item.product_id");
    expect(sql).toContain("on conflict (cart_id, product_id) do update");
    expect(sql).toContain("public.cart_items.quantity + excluded.quantity");
    expect(sql.match(/insert into public\.cart_items/g)).toHaveLength(1);
  });

  it("does not create orders or expose write grants", () => {
    expect(sql).not.toContain("insert into public.partner_orders");
    expect(sql).not.toContain("insert into public.partner_order_items");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)/i);
    expect(sql).toContain("revoke all on function public.merge_order_reorder_items_into_cart");
  });

  it("records one aggregate audit event without commercial amounts", () => {
    expect(sql).toContain("event_type text not null default 'order_reordered_to_cart'");
    expect(sql).toContain("selected_line_count");
    expect(sql).not.toContain("unit_price");
    expect(sql).not.toContain("line_total");
  });
});

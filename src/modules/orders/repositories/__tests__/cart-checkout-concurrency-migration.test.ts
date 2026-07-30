import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    "supabase/migrations/20260730220000_cart_checkout_intent_version.sql",
  ),
  "utf8",
);

describe("cart checkout intent-version migration", () => {
  it("versions only cart-line intent changes", () => {
    expect(sql).toContain(
      "add column if not exists intent_version bigint not null default 1",
    );
    expect(sql).toContain(
      "after insert or delete or update of quantity on public.cart_items",
    );
    expect(sql).not.toMatch(
      /after update[\s\S]*product_prices|after update[\s\S]*product_stock/i,
    );
  });

  it("compares the expected version and exact canonical line set under a cart lock", () => {
    expect(sql).toContain("for update;");
    expect(sql).toContain(
      "target_cart.intent_version <> target_expected_intent_version",
    );
    expect(sql).toContain("CART_INTENT_VERSION_CONFLICT");
    expect(sql).toContain("select item.product_id, item.quantity");
    expect(sql).toContain("except");
  });

  it("keeps the deployed RPC compatible and adds a versioned submission RPC", () => {
    expect(sql).toContain(
      "create or replace function public.begin_partner_order_submission_v2",
    );
    expect(sql).not.toContain(
      "drop function public.begin_partner_order_submission(",
    );
    expect(sql).toContain(
      "grant execute on function public.begin_partner_order_submission_v2",
    );
  });

  it("uses one cart-first lock order for quantity changes, removal, and checkout", () => {
    expect(sql).toContain("for update of cart;");
    expect(sql.match(/for update of cart;/g)).toHaveLength(2);
    expect(sql).toContain("cart.status = 'active'");
    expect(sql).toContain("update public.cart_items");
    expect(sql).toContain("delete from public.cart_items");
  });

  it("uses the Chisinau business date without versioning the shipment date", () => {
    expect(sql).toContain(
      "(now() at time zone 'Europe/Chisinau')::date",
    );
    expect(sql).not.toContain("planned_shipment_intent_version");
  });

  it("does not clear the cart during checkout acquisition", () => {
    const begin = sql.indexOf(
      "create or replace function public.begin_partner_order_submission_v2",
    );
    const grants = sql.indexOf("revoke all on function", begin);
    expect(sql.slice(begin, grants)).not.toContain(
      "delete from public.cart_items",
    );
  });
});

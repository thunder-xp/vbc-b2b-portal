import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260713220000_partner_cart_orders_foundation.sql"), "utf8");

describe("partner cart and order migration", () => {
  it("increments duplicate cart products and validates positive quantities", () => {
    expect(sql).toContain("on conflict (cart_id, product_id) do update");
    expect(sql).toContain("quantity = public.cart_items.quantity + excluded.quantity");
    expect(sql).toContain("check (quantity between 1 and 9999)");
  });

  it("isolates partner data and grants no anonymous mutation surface", () => {
    expect(sql).toContain("created_by = auth.uid()");
    expect(sql).toContain("public.can_manage_partner_order_company(company_id)");
    expect(sql).toContain("revoke all on function public.add_partner_cart_item(uuid, uuid, integer) from public, anon");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete).*\bto\s+authenticated/i);
  });

  it("uses one atomic submission winner and clears the cart only on completion", () => {
    expect(sql).toContain("submission_key uuid not null unique");
    expect(sql).toContain("submission_attempt_id uuid not null unique");
    const begin = sql.indexOf("create or replace function public.begin_partner_order_submission");
    const complete = sql.indexOf("create or replace function public.complete_partner_order_submission");
    expect(sql.slice(begin, complete)).not.toContain("delete from public.cart_items");
    expect(sql.slice(complete)).toContain("delete from public.cart_items where cart_id = target_order.cart_id");
  });

  it("stores immutable submitted product and commercial snapshots", () => {
    expect(sql).toContain("partner_unit_price numeric(18, 4) not null");
    expect(sql).toContain("available_stock numeric(18, 3)");
    expect(sql).toContain("nearest_arrival_date date");
    expect(sql).not.toMatch(/grant\s+update\s+on\s+table\s+public\.partner_order_items/i);
  });
});

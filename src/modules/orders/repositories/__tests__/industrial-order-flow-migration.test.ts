import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  "supabase/migrations/20260715070000_industrial_partner_order_flow.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");

describe("industrial partner order flow migration", () => {
  it("keeps portal, integration, and 1C statuses separate", () => {
    expect(sql).toContain("integration_status text not null default 'processing'");
    expect(sql).toContain("one_c_order_status text null");
    expect(sql).toContain("partner_orders_integration_status_check");
  });

  it("adds a versioned atomic completion RPC without removing the old RPC", () => {
    expect(sql).toContain("complete_partner_order_submission_v2");
    expect(sql).not.toMatch(/drop function[^;]*complete_partner_order_submission\(/i);
    expect(sql).toMatch(/status = 'submitted'[\s\S]*integration_status = 'confirmed'/);
    expect(sql).toMatch(/delete from public\.cart_items[\s\S]*status = 'converted'[\s\S]*insert into public\.carts/);
  });

  it("prevents two live attempts for one cart", () => {
    expect(sql).toContain("partner_orders_one_live_attempt_per_cart_idx");
    expect(sql).toContain("status in ('processing', 'submitted', 'unknown')");
  });

  it("keeps reconciliation internal and never deletes uncertain cart items", () => {
    expect(sql).toContain("not public.can_review_partner_orders()");
    expect(sql).toContain("manual_review_required");
    const reconciliation = sql.slice(sql.indexOf("create or replace function public.reconcile_partner_order_submission"));
    expect(reconciliation).not.toContain("delete from public.cart_items");
  });
});

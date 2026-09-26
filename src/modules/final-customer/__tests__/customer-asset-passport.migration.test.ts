import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260926150000_customer_asset_passport_v1.sql"), "utf8");

describe("Customer Asset Passport migration", () => {
  it("requires the exact active customer context and an owned confirmed paid line", () => {
    expect(sql).toContain("account.auth_user_id = p_actor_user_id");
    expect(sql).toContain("account.customer_identity_id = p_customer_identity_id");
    expect(sql).toContain("line.id = p_retail_order_line_id");
    expect(sql).toContain("customer.customer_identity_id = p_customer_identity_id");
    expect(sql).toContain("orders.status = 'confirmed'");
    expect(sql).toContain("orders.paid_at is not null");
  });

  it("uses exact line relations and bounded customer-visible history", () => {
    expect(sql).toContain("request.retail_order_line_id = p_retail_order_line_id");
    expect(sql).toContain("item.retail_order_line_id = p_retail_order_line_id");
    expect(sql).toContain("least(greatest(coalesce(p_service_limit, 5), 1), 10)");
    expect(sql).not.toMatch(/internal_note|customer_service_messages|serial_number|warranty_start/i);
  });

  it("keeps the RPC service-only and avoids live integration work", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("from public, anon, authenticated, service_role");
    expect(sql).toContain("to service_role");
    expect(sql).not.toMatch(/http_|net\.|onec|1c_/i);
  });
});

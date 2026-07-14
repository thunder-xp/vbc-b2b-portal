import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(
  "supabase/migrations/20260714234000_partner_order_confirmed_not_created.sql",
), "utf8");

describe("partner order confirmed-not-created reconciliation", () => {
  it("preserves diagnostics while atomically failing the attempt and unlocking the cart", () => {
    expect(sql).toContain("reconciliation_result = 'confirmed_not_created'");
    expect(sql).toContain("reconciliation_previous_status = target_order.status");
    expect(sql).toMatch(/set status = 'failed',[\s\S]*reconciliation_result/);
    expect(sql).toMatch(/set status = 'active'[\s\S]*status = 'submitting'/);
    expect(sql).not.toMatch(/safe_error_(code|message|details|hint)\s*=/);
    expect(sql).not.toMatch(/delete from public\.(carts|cart_items|partner_orders|partner_order_items)/);
  });

  it("requires the exact prior submission key and rejects completed attempts", () => {
    expect(sql).toContain("id = target_order_id and submission_key = target_submission_key");
    expect(sql).toContain("target_order.status not in ('processing', 'unknown')");
    expect(sql).toContain("target_order.external_1c_ref is not null");
    expect(sql).toContain("target_order.external_1c_number is not null");
  });

  it("does not grant anonymous reconciliation", () => {
    expect(sql).toMatch(/revoke all on function[\s\S]*from public, anon/);
    expect(sql).toMatch(/grant execute on function[\s\S]*to authenticated, service_role/);
  });
});

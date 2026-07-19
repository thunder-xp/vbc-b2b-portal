import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260719173000_order_date_change_review_and_reconciliation.sql"), "utf8");

describe("order date-change review and reconciliation", () => {
  it("records review atomically without changing the authoritative shipment date", () => {
    expect(sql).toContain("public.can_review_order_date_changes()");
    expect(sql).toContain("target.status <> 'pending'");
    expect(sql).toContain("status = target_decision");
    expect(sql).not.toMatch(/set\s+one_c_delivery_date\s*=/i);
  });

  it("reconciles only a matching approved request from an authoritative history update", () => {
    expect(sql).toContain("after update of one_c_delivery_date");
    expect(sql).toContain("status = 'approved'");
    expect(sql).toContain("requested_date = new.one_c_delivery_date");
    expect(sql).toContain("md5(new.id::text || ':' || event_name)");
    expect(sql).toContain("on conflict (fingerprint) do nothing");
  });

  it("does not grant partners update or review access", () => {
    expect(sql).toContain("revoke all on function public.can_review_order_date_changes() from public, anon");
    expect(sql).toContain("grant execute on function public.review_partner_order_date_change_request(uuid, text, text) to authenticated");
    expect(sql).toContain("if not public.can_review_order_date_changes()");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260719170000_order_date_change_requests.sql"), "utf8");

describe("order date-change migration", () => {
  it("keeps partner writes behind narrow RPCs and RLS", () => {
    expect(sql).toContain("alter table public.partner_order_date_change_requests enable row level security");
    expect(sql).toContain("revoke all on table public.partner_order_date_change_requests from anon, authenticated");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)/i);
    expect(sql).toContain("public.has_permission(target_order.company_id, 'orders.manage')");
    expect(sql).toContain("target_order.company_id, target_order.id, auth.uid()");
  });

  it("enforces one pending request and never updates the authoritative order date", () => {
    expect(sql).toContain("where status = 'pending'");
    expect(sql).not.toMatch(/update\s+public\.partner_order_history\s+set\s+one_c_delivery_date/i);
    expect(sql).toContain("target_requested_date <= current_date");
  });
});

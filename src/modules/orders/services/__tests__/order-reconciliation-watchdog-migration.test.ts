import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve("supabase/migrations/20260825113304_partner_order_reconciliation_watchdog.sql"),
  "utf8",
);

describe("partner order reconciliation watchdog migration", () => {
  it("claims only unknown reconciliation-required orders with a bounded skip-locked lease", () => {
    expect(sql).toMatch(/status = 'unknown'[\s\S]*integration_status = 'reconciliation_required'/);
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("p_limit > 20");
    expect(sql).toContain("reconciliation_lease_expires_at");
  });

  it("keeps reconciliation evidence append-only and service-role only", () => {
    expect(sql).toContain("reconciliation events are append-only");
    expect(sql).toContain("enable row level security");
    expect(sql).toMatch(/revoke all on table public\.partner_order_reconciliation_events from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.claim_partner_order_reconciliations[\s\S]*to service_role/);
  });

  it("does not release carts or create 1C orders", () => {
    expect(sql).not.toMatch(/set\s+status\s*=\s*'active'/i);
    expect(sql).not.toContain("createSalesOrder");
    expect(sql).not.toContain("partner_order_items");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20261013193527_governed_partner_one_c_manual_sync.sql"),
  "utf8",
);

describe("governed Partner 1C manual synchronization migration", () => {
  it("keeps the snapshot company-scoped and never replaces the verified binding", () => {
    expect(sql).toContain("lower(coalesce(company.external_1c_id, '')) <> counterparty_ref");
    expect(sql).toContain("where is_published and lower(counterparty_external_1c_id) = counterparty_ref");
    expect(sql).not.toMatch(/update public\.partner_companies\s+set external_1c_id/i);
  });

  it("enforces permissions, bounded input, immutable audit and idempotency", () => {
    expect(sql).toContain("has_internal_permission('admin.integrations.manage')");
    expect(sql).toContain("has_internal_permission('admin.partner_integrity.manage')");
    expect(sql).toContain("jsonb_array_length(contracts) > 50");
    expect(sql).toContain("prevent_partner_company_one_c_manual_sync_event_mutation");
    expect(sql).toContain("previous_event.snapshot_hash = snapshot_hash");
  });

  it("preserves RLS and grants only the authenticated RPC boundary", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on table public.partner_company_one_c_manual_sync_events from public, anon, authenticated");
    expect(sql).toContain("to authenticated");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve("supabase/migrations/20260803210000_bootstrap_analytics_stabilization.sql"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("bootstrap and analytics stabilization migration", () => {
  it("accepts the root cabinet route and records atomic idempotent batches", () => {
    expect(sql).toContain("route = '/cabinet' or route like '/cabinet/%'");
    expect(sql).toContain("record_partner_behavior_events_batch");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("partner_behavior_event_idempotency");
    expect(sql).toContain("jsonb_array_length(p_events) not between 1 and 5");
  });

  it("uses one current published counterparty identity without requiring a portal link", () => {
    expect(sql).toContain("mapping_count <> 1 or conflicting_mapping_count > 0");
    expect(sql).not.toContain("counterparty.portal_company_id = company.id\n    and counterparty.is_published");
    expect(sql).toContain("verified_full_history_backfilled");
  });

  it("does not requeue a terminal bootstrap from page access", () => {
    expect(sql).toContain("state.status = 'failed_terminal' and not p_force");
    expect(sql).toContain("state.status = 'failed_retryable'");
    expect(sql).toContain("state.next_retry_at");
  });

  it("keeps direct table access closed", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on public.partner_behavior_event_idempotency");
    expect(sql).toContain("to authenticated;");
  });
});

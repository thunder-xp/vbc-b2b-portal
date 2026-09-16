import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260916182913_maib_verified_callback_phase2.sql", "utf8").toLowerCase();

describe("MAIB Phase 2 migration", () => {
  it("adds durable provider deduplication and append-only payment evidence", () => {
    expect(sql).toContain("create table public.retail_payment_provider_events");
    expect(sql).toContain("unique (provider, provider_payment_id, provider_status)");
    expect(sql).toContain("create table public.retail_payment_events");
    expect(sql).toContain("retail payment events are append-only");
    expect(sql).toContain("provider_event.processing_outcome <> processing_outcome");
  });

  it("confirms paid evidence and reuses the existing activation boundary", () => {
    expect(sql).toContain("confirm_maib_retail_payment_callback_v1");
    expect(sql).toContain("public.activate_paid_retail_order(");
    expect(sql).toContain("paid_pending_activation");
    expect(sql).toContain("retry_maib_retail_payment_activation_v1");
    expect(sql).toContain("for update");
    expect(sql).toContain("attempt.status in ('created', 'pending', 'paid_pending_activation')");
    expect(sql).toContain("where status in ('created', 'pending', 'paid_pending_activation')");
  });

  it("keeps new tables and RPCs server-only", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("from public, anon, authenticated, service_role");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("get_retail_payment_return_state_v1(p_payment_attempt_id uuid)");
    expect(sql).not.toMatch(/grant (select|insert|update|delete)[\s\S]*to (anon|authenticated)/);
  });
});

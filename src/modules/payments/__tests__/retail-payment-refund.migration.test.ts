import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260916193733_maib_retail_payment_refunds_phase3.sql"), "utf8");

describe("MAIB Phase 3 refund migration", () => {
  it("creates a provider-neutral, protected, append-only refund ledger", () => {
    expect(sql).toContain("create table public.retail_payment_refunds");
    expect(sql).toContain("create table public.retail_payment_refund_events");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("from public, anon, authenticated, service_role");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("prevent_retail_payment_refund_event_mutation_v1");
  });

  it("locks the paid attempt, derives remaining amount, and prevents concurrent full refunds", () => {
    expect(sql).toContain("for update");
    expect(sql).toContain("attempt.status <> 'paid'");
    expect(sql).toContain("attempt.provider_payment_id is null");
    expect(sql).toContain("remaining_amount := round(attempt.amount - confirmed_total, 2)");
    expect(sql).toContain("create unique index retail_payment_refunds_active_full_idx");
    expect(sql).toContain("unique");
  });

  it("requires exact full-refund evidence and never reverses order or installation state", () => {
    expect(sql).toContain("p_refund_type <> 'Full'");
    expect(sql).toContain("p_provider_status = 'Accepted'");
    expect(sql).toContain("p_payment_status = 'Refunded'");
    expect(sql).toContain("p_remaining_refundable");
    expect(sql).not.toContain("update public.retail_orders");
    expect(sql).not.toContain("installation_requirements");
    expect(sql).not.toContain("assignment");
    expect(sql).not.toContain("activate_paid_retail_order");
  });

  it("adds a narrow internal finance permission instead of public mutation", () => {
    expect(sql).toContain("admin.payments.refund");
    expect(sql).toContain("novotech_finance");
    expect(sql).toContain("revoke all on function public.claim_retail_payment_refund_v1");
  });
});

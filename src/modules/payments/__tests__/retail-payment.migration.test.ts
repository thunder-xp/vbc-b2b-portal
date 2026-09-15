import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260915123902_retail_payment_attempts_maib_v2_phase1.sql", "utf8").toLowerCase();

describe("retail payment attempt migration", () => {
  it("creates a provider-neutral durable and constrained payment attempt", () => {
    expect(sql).toContain("create table public.retail_payment_attempts");
    expect(sql).toContain("references public.retail_orders(id) on delete restrict");
    expect(sql).toContain("idempotency_key uuid not null unique");
    expect(sql).toContain("retail_payment_attempts_provider_checkout_idx");
    expect(sql).toContain("retail_payment_attempts_active_order_provider_idx");
    expect(sql).toContain("amount numeric(14,2) not null check (amount > 0)");
  });

  it("derives payment truth in one locked server-governed claim", () => {
    const claim = sql.slice(sql.indexOf("create or replace function public.claim_retail_payment_attempt"), sql.indexOf("create or replace function public.complete_retail_payment_attempt_checkout"));
    expect(claim).toContain("for update of orders");
    expect(claim).toContain("target_order.status <> 'awaiting_payment'");
    expect(claim).toContain("target_order.orchestration_snapshot_locked");
    expect(claim).toContain("target_order.final_commercial_total");
    expect(claim).toContain("line.unit_price <= 0");
    expect(claim).not.toContain("p_amount");
    expect(claim).not.toContain("p_currency");
  });

  it("keeps all browser roles outside payment persistence and activation", () => {
    expect(sql).toContain("alter table public.retail_payment_attempts enable row level security");
    expect(sql).toContain("revoke all on public.retail_payment_attempts from public, anon, authenticated, service_role");
    expect(sql).toContain("grant select, insert, update on public.retail_payment_attempts to service_role");
    expect(sql).not.toContain("activate_paid_retail_order");
    expect(sql).not.toContain("service_role_key");
    expect(sql).not.toMatch(/\n\s*(oauth_token|access_token|client_secret|signature_key)\s/);
  });
});

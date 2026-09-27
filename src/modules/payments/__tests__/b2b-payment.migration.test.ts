import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260927120000_b2b_maib_online_payment_v1.sql",
  "utf8",
).toLowerCase();

describe("B2B MAIB payment migration", () => {
  it("keeps B2B attempts isolated from RetailOrder storage", () => {
    expect(sql).toContain("create table public.b2b_payment_attempts");
    expect(sql).toContain("references public.partner_orders");
    expect(sql).not.toContain("references public.retail_orders");
    expect(sql).not.toContain("update public.retail_orders");
  });

  it("derives eligibility and commercial truth inside the governed claim", () => {
    expect(sql).toContain("target_order.document_total");
    expect(sql).toContain("target_order.currency_code");
    expect(sql).toContain("diagnostic.payment_method <> 'cashless'");
    expect(sql).toContain("diagnostic.planned_payment_date <>");
    expect(sql).toContain("diagnostic.read_back_verified");
    expect(sql).toContain("has_permission(target_order.company_id, 'orders.manage')");
  });

  it("confirms an executed payment exactly once from verified provider evidence", () => {
    expect(sql).toContain("for update");
    expect(sql).toContain("p_order_reference is distinct from attempt.id");
    expect(sql).toContain("p_checkout_amount is null or p_payment_amount is null");
    expect(sql).toContain("p_provider_status is null");
    expect(sql).toContain("p_provider_status <> 'executed'");
    expect(sql).toContain("b2b_payment_events_paid_once_idx");
    expect(sql).toContain("'outcome', 'duplicate'");
  });

  it("keeps direct mutations private and the browser return token read-only", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("attempt.return_access_token_hash = p_return_access_token_hash");
    expect(sql).toContain("set return_access_token_hash = p_return_access_token_hash");
    expect(sql).not.toContain("grant insert on table public.b2b_payment_attempts to authenticated");
  });
});

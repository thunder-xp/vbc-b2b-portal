import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260802160000_partner_order_history_bootstrap.sql"), "utf8");

describe("partner order-history bootstrap migration", () => {
  it("defines durable state, immutable audit, RLS, and a 24-month range", () => {
    expect(sql).toContain("create table public.partner_order_history_bootstrap_state");
    expect(sql).toContain("create table public.partner_order_history_bootstrap_events");
    expect(sql).toContain("immutable_order_history_bootstrap_events");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("interval '24 months'");
  });

  it("enqueues from approval without making approval depend on provider work", () => {
    expect(sql).toContain("enqueue_order_history_bootstrap_after_approval");
    expect(sql).toContain("exception when others");
    expect(sql).not.toContain("Document_ЗаказПокупателя");
  });

  it("uses only the canonical company-to-counterparty identity mapping", () => {
    expect(sql).toContain("lower(counterparty.external_1c_id) = lower(company.external_1c_id)");
    expect(sql).toContain("counterparty.portal_company_id = company.id");
    expect(sql).not.toMatch(/fiscal_code\s*=|display_name\s*=/);
  });

  it("claims one job with stale-lock recovery and bounded retry backoff", () => {
    expect(sql).toContain("for update skip locked limit 1");
    expect(sql).toContain("p_stale_after_seconds");
    expect(sql).toContain("state.retry_count < 5");
  });

  it("gates partial momentum and queues downstream projections after success", () => {
    expect(sql).toContain("history_sync_pending");
    expect(sql).toContain("history_sync_delayed");
    expect(sql).toContain("enqueue_partner_momentum_company");
    expect(sql).toContain("partner_commercial_opportunity_dirty_companies");
  });

  it("does not grant partner or browser direct table access", () => {
    expect(sql).toContain("revoke all on public.partner_order_history_bootstrap_state");
    expect(sql).not.toContain("grant select on public.partner_order_history_bootstrap_state to authenticated");
  });
});

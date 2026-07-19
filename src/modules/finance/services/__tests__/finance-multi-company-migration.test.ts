import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260720030000_partner_finance_multi_company_sync.sql"), "utf8");

describe("multi-company finance synchronization migration", () => {
  it("adds per-company state and an amount-free audit trail with RLS", () => {
    expect(sql).toContain("create table if not exists public.partner_finance_sync_state");
    expect(sql).toContain("create table if not exists public.partner_finance_sync_events");
    expect(sql).toContain("alter table public.partner_finance_sync_state enable row level security");
    expect(sql).toContain("public.has_permission(company_id, 'finance.view_company')");
    const eventTable = sql.match(/create table if not exists public\.partner_finance_sync_events \([\s\S]*?\n\);/)?.[0] ?? "";
    expect(eventTable).not.toMatch(/signed_balance|financial_amount/i);
  });

  it("publishes balances and successful state atomically without replacing the old RPC", () => {
    expect(sql).toContain("public.publish_partner_contract_balances_v2");
    expect(sql).toContain("public.publish_partner_contract_balances(p_company_id");
    expect(sql).not.toContain("drop function public.publish_partner_contract_balances");
    expect(sql).toContain("grant execute on function public.publish_partner_contract_balances_v2");
  });

  it("exposes one bounded local overview read and denies anonymous execution", () => {
    expect(sql).toContain("public.get_partner_finance_overview");
    expect(sql).toContain("revoke all on function public.get_partner_finance_overview(uuid) from public, anon");
    expect(sql).toContain("grant execute on function public.get_partner_finance_overview(uuid) to authenticated");
  });

  it("grants manual synchronization only through an internal finance permission", () => {
    expect(sql).toContain("'finance.sync'");
    expect(sql).toContain("role.code in ('novotech_admin', 'novotech_finance')");
    expect(sql).toContain("public.can_run_partner_finance_sync()");
    expect(sql).toContain("profile.user_type in ('internal', 'admin')");
  });
});

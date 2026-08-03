import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260803220000_concise_operational_dashboard.sql"),
  "utf8",
);

describe("concise operational dashboard migration", () => {
  it("projects only tenant-bound order history with valid detail routes", () => {
    expect(sql).toContain("public.has_active_company_membership(p_company_id)");
    expect(sql).toContain("join visible_history history on history.portal_order_id = portal_order.id");
    expect(sql).toContain("join public.partner_order_history history");
    expect(sql).toContain("and history.partner_visible");
    expect(sql).toContain("'/cabinet/orders/' || history.id::text as href");
    expect(sql).toContain("'href', item.href");
    expect(sql).not.toContain("'/cabinet/orders/' || portal_order.id::text");
  });

  it("classifies TEST orders once and keeps them out of ordinary shipment counters", () => {
    expect(sql).toContain("create or replace function public.is_partner_test_order");
    expect(sql).toContain("p_is_governed_test_contract boolean default false");
    expect(sql).toContain("lower(btrim(balance.contract_name)) = 'тестовый договор'");
    expect(sql).toContain("'test_return_overdue'");
    expect(sql).toContain("'test_return_today'");
    expect(sql).toContain("and not public.is_partner_test_order(");
    expect(sql).toContain("test_contract.external_contract_ref is not null");
  });

  it("uses company-scoped fingerprint-aware suppression with a seven-day TEST cooldown", () => {
    expect(sql).toContain("unique (company_id, item_type, source_id)");
    expect(sql).toContain("and dismissal.item_id = p_item_id");
    expect(sql).toContain("dismissal.source_fingerprint = candidate.fingerprint");
    expect(sql).toContain("now() + interval '7 days'");
    expect(sql).toContain("public.has_active_company_membership(p_company_id)");
  });

  it("keeps the dismissal audit append-only and server mediated", () => {
    expect(sql).toContain("prevent_partner_dashboard_attention_event_mutation");
    expect(sql).toContain("before update or delete on public.partner_dashboard_attention_events");
    expect(sql).toContain("revoke all on public.partner_dashboard_attention_dismissals");
    expect(sql).toContain("revoke all on function public.dismiss_partner_dashboard_attention(uuid,uuid,text)");
    expect(sql).toContain("grant execute on function public.dismiss_partner_dashboard_attention(uuid,uuid,text)");
  });

  it("does not synthesize finance freshness warnings or call 1C", () => {
    expect(sql).not.toMatch(/finance_stale|finance_refresh/i);
    expect(sql).not.toMatch(/Document_|InformationRegister_|http_|net\.http/);
  });
});

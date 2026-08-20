import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260820172133_warehouse_arrival_notifications.sql"), "utf8");

describe("warehouse arrival migration", () => {
  it("detects only the proven supplier status transition", () => {
    expect(sql).toContain("previous.current_state_ref = '02166cc3-bf4b-11e9-a7fe-000c2988d323'");
    expect(sql).toContain("stage.external_state_ref = '585a9991-314b-11e9-a7dc-94de80db60f1'");
    expect(sql).toContain("on conflict (fingerprint) do nothing");
  });

  it("makes arrival truth immutable and keeps attention state separate", () => {
    expect(sql).toContain("warehouse_arrivals_immutable");
    expect(sql).toContain("warehouse_arrival_items_immutable");
    expect(sql).toContain("warehouse_arrival_user_state");
    expect(sql).toContain("mark_partner_warehouse_arrival_seen");
  });

  it("prevents historical bootstrap notification spam", () => {
    expect(sql).toContain("join public.supplier_order_source_states previous");
    expect(sql).toContain("not arrival.silent_bootstrap");
    expect(sql).not.toContain("insert into public.warehouse_arrivals select");
  });

  it("exposes only safe partner aggregates through governed RPCs", () => {
    const partnerFunctions = sql.slice(sql.indexOf("create function public.list_partner_warehouse_arrivals"), sql.indexOf("alter table public.partner_notification_events"));
    expect(partnerFunctions).toContain("public.has_active_company_membership");
    expect(partnerFunctions).toContain("public.has_permission(p_company_id, 'catalog.view')");
    expect(partnerFunctions).not.toContain("source_order_ref");
    expect(partnerFunctions).not.toContain("organization_ref");
    expect(partnerFunctions).not.toContain("warehouse_ref");
  });

  it("uses bounded pagination and one product projection", () => {
    expect(sql).toContain("p_limit > 50");
    expect(sql).toContain("offset p_offset limit p_limit");
    expect(sql).toContain("count(distinct item.product_id)");
    expect(sql).toContain("warehouse_arrival_user_state(company_id, user_id, arrival_id)");
  });

  it("extends the governed notification URL allowlist only for arrival UUID routes", () => {
    expect(sql).toContain("value ~ '^/cabinet/arrivals/[0-9a-f-]{36}$'");
    expect(sql).toContain("create or replace function public.is_allowed_partner_notification_url");
  });

  it("aliases dashboard JSON ordinality explicitly", () => {
    expect(sql).toContain("with ordinality as entries(value, ordinal)");
  });
});

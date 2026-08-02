import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260802130000_partner_momentum_retention.sql"), "utf8");

describe("partner momentum migration", () => {
  it("creates the focused read model, queue, events, actions, and diagnostics", () => {
    for (const table of ["partner_momentum_snapshots","partner_momentum_reasons","partner_momentum_events","partner_retention_actions","partner_momentum_dirty_companies","partner_momentum_projection_runs","partner_momentum_control_assignments"]) expect(sql).toContain(`create table public.${table}`);
  });
  it("enables RLS and exposes only redacted partner data through an RPC", () => {
    expect(sql).toContain("alter table public.partner_momentum_snapshots enable row level security");
    expect(sql).toContain("revoke all on public.partner_momentum_snapshots");
    expect(sql).toContain("get_partner_momentum_summary");
    expect(sql).not.toContain("grant select on public.partner_momentum_snapshots to authenticated");
  });
  it("uses local set-based order history and never calls 1C", () => {
    expect(sql).toContain("from public.partner_order_history history");
    expect(sql).toContain("left join public.partner_order_history_items item");
    expect(sql).not.toContain("Document_ЗаказПокупателя");
    expect(sql).not.toContain("http");
  });
  it("separates currencies and bounds the source scan", () => {
    expect(sql).toContain("history.currency_code");
    expect(sql).toContain("interval '730 days'");
    expect(sql).toContain("limit 2000");
  });
  it("enforces assigned-manager access unless view-all is granted", () => {
    expect(sql).toContain("partner_momentum.view_assigned");
    expect(sql).toContain("partner_momentum.view_all");
    expect(sql).toContain("company.assigned_internal_manager_user_id=actor");
  });
  it("keeps history append-only and projection publication atomic", () => {
    expect(sql).toContain("immutable_partner_momentum_events");
    expect(sql).toContain("perform 1 from public.partner_companies where id=target_company for update");
    expect(sql).toContain("on conflict(company_id) do update");
  });
  it("excludes retail-only roles from the partner momentum permission", () => {
    expect(sql).toContain("('partner_buyer', 'partner_momentum.partner_view')");
    expect(sql).not.toContain("('partner_viewer', 'partner_momentum.partner_view')");
    expect(sql).not.toContain("('partner_accounting', 'partner_momentum.partner_view')");
  });
  it("ships a disabled holdout capability without withholding critical data", () => {
    expect(sql).toContain("constraint partner_momentum_control_disabled_default check (not is_holdout)");
  });
});


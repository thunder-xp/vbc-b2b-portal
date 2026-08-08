import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260808220000_one_c_service_history.sql"), "utf8");

describe("1C service-history migration contract", () => {
  it("creates the bounded read model, events, conflicts, RLS, and supporting indexes", () => {
    expect(sql).toContain("create table public.one_c_service_history (");
    expect(sql).toContain("create table public.one_c_service_history_sync_runs");
    expect(sql).toContain("create table public.one_c_service_history_events");
    expect(sql).toContain("create table public.one_c_service_history_conflicts");
    expect(sql).toContain("alter table public.one_c_service_history enable row level security");
    expect(sql).toContain("one_c_service_history_company_date_idx");
  });

  it("maps companies and products only by exact canonical 1C references", () => {
    expect(sql).toContain("lower(company.external_1c_id)=lower(source.counterparty_ref)");
    expect(sql).toContain("lower(product.external_1c_id)=lower(source.product_ref)");
    expect(sql).not.toContain("company.display_name=");
    expect(sql).not.toContain("product.name=");
  });

  it("keeps imported records read-only and partner access company-scoped", () => {
    expect(sql).toContain("revoke all on public.one_c_service_history_sync_runs, public.one_c_service_history");
    expect(sql).toContain("h.company_id=p_company_id and h.partner_visible and h.is_active");
    expect(sql).toContain("public.has_permission(p_company_id,'service.view')");
    expect(sql).toContain("public.has_permission(h.company_id,'service.view')");
  });

  it("does not expose internal technician text or raw 1C references through partner RPCs", () => {
    const partnerRpc = sql.slice(sql.indexOf("create or replace function public.get_partner_one_c_service_history"), sql.indexOf("create or replace function public.list_admin_unified_service_history"));
    expect(partnerRpc).toContain("partner_visible_resolution");
    expect(partnerRpc).not.toContain("source_repair_description");
    expect(partnerRpc).not.toContain("source_document_ref");
    expect(partnerRpc).not.toContain("one_c_counterparty_ref");
  });

  it("suppresses baseline notifications and deduplicates later status transitions", () => {
    expect(sql).toContain("if not found or e.baseline or e.event_type<>'status_changed' then return 0");
    expect(sql).toContain("on conflict(recipient_user_id,deduplication_key) do nothing");
    expect(sql).toContain("service_history_ready_for_pickup");
  });

  it("retains unposted and deleted source rows but makes them inactive", () => {
    expect(sql).toContain("company_id is not null and source_posted and not source_deletion_mark");
    expect(sql).toContain("'made_inactive'");
    expect(sql).not.toContain("delete from public.one_c_service_history");
  });

  it("uses bounded resumable claims and rejects zero 1C GUIDs", () => {
    expect(sql).toContain("page_size integer not null default 100 check (page_size between 1 and 100)");
    expect(sql).toContain("current_skip");
    expect(sql).toContain("60 months");
    expect(sql).toContain("120 days");
    expect(sql).toContain("<> '00000000-0000-0000-0000-000000000000'");
    expect(sql).toContain("end filter_mode");
    expect(sql).not.toContain("end filter,");
  });
});

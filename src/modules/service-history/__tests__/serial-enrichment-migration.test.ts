import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260808230000_service_history_serial_enrichment.sql"), "utf8");

describe("service-history serial enrichment migration", () => {
  it("uses a bounded resumable service-role worker", () => {
    expect(sql).toContain("create table public.one_c_service_serial_enrichment_runs");
    expect(sql).toContain("page_size integer not null default 100");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("serial_resolution_state='pending'");
    expect(sql).toContain("stale_lock");
    expect(sql).toContain("auth.role()<>'service_role'");
  });

  it("links warranty state only by exact serial hash and company-safe evidence", () => {
    expect(sql).toContain("state.normalized_serial_hash=source.serial_hash");
    expect(sql).toContain("state.last_sale_company_id is distinct from history.company_id");
    expect(sql).toContain("state.last_sale_product_id<>history.product_id");
    expect(sql).toContain("not state.chronology_complete");
    expect(sql).toContain("'review_required'");
  });

  it("keeps protected serial out of the partner projection and exposes it only to authorized internal reads", () => {
    const partner = sql.slice(sql.indexOf("create or replace function public.get_partner_one_c_service_history"), sql.indexOf("create or replace function public.get_admin_one_c_service_history"));
    const admin = sql.slice(sql.indexOf("create or replace function public.get_admin_one_c_service_history"), sql.indexOf("create or replace function public.get_one_c_service_history_diagnostics"));
    expect(partner).not.toContain("protectedSerial");
    expect(partner).not.toContain("protected_serial");
    expect(admin).toContain("'protectedSerial',h.protected_serial");
    expect(admin).toContain("has_internal_permission('admin.service.view')");
  });

  it("resets enrichment when the authoritative Serie_Key changes and keeps detail reads bounded", () => {
    expect(sql).toContain("if new.one_c_serial_ref is distinct from old.one_c_serial_ref");
    expect(sql).toContain("where e.service_history_id=h.id");
    expect(sql).not.toContain("delete from public.one_c_service_history");
  });

  it("revokes direct worker and trigger helper execution", () => {
    expect(sql).toContain("from public,anon,authenticated");
    expect(sql).toContain("to service_role");
  });
});

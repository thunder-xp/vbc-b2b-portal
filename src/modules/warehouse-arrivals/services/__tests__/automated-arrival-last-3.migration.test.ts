import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260912080603_automated_arrival_last_3_eligible_shipments.sql"),
  "utf8",
);
const reconcile = migration.slice(
  migration.indexOf("create or replace function public.reconcile_current_warehouse_replenishment_day"),
  migration.indexOf("create function public.get_partner_current_warehouse_replenishment_v2"),
);
const eligibility = reconcile.slice(0, reconcile.indexOf("select current.source_fingerprint"));

describe("rolling latest-three ARRIVAL migration", () => {
  it("ranks immutable actually completed shipment batches and never collapses to the latest calendar date", () => {
    expect(reconcile).toContain("from public.warehouse_arrivals arrival");
    expect(reconcile).toContain("arrival.completed_at <= statement_timestamp()");
    expect(reconcile).toContain("arrival.source_status_after = '585a9991-314b-11e9-a7dc-94de80db60f1'");
    expect(reconcile).toContain("state.current_state_ref = '585a9991-314b-11e9-a7dc-94de80db60f1'");
    expect(reconcile).toContain("order by arrival.completed_at desc");
    expect(reconcile).toContain("arrival.source_order_number desc");
    expect(reconcile).toContain("limit 3");
    expect(reconcile).not.toContain("select max(state.source_document_date)");
    expect(eligibility).not.toMatch(/interval '\d+ days'/);
  });

  it("filters current invalid states and future completion events without transport or planned-date eligibility", () => {
    expect(reconcile).toContain("state.is_posted");
    expect(reconcile).toContain("not state.is_deleted");
    expect(reconcile).toContain("not state.is_closed");
    expect(reconcile).not.toMatch(/where[^;]*(transport|air|sea|road|courier)/i);
    expect(reconcile).not.toMatch(/expected_arrival_date\s*<=/);
    expect(reconcile).not.toMatch(/expected_arrival_date\s*>=/);
  });

  it("uses governed SECURITYPARK root ancestry before a shipment can consume a window slot", () => {
    expect(reconcile).toContain("state.root_name = 'SECURITYPARK DISTRIBUTION'");
    expect(reconcile).toContain("product.source_root_1c_id = securitypark_root_ref");
    expect(reconcile).toMatch(/and exists \([\s\S]*warehouse_arrival_items item[\s\S]*source_root_1c_id = securitypark_root_ref[\s\S]*\)\n\s*order by arrival\.completed_at desc/);
  });

  it("deduplicates products with newest-window provenance and deterministic product order", () => {
    expect(reconcile).toContain("partition by product.id");
    expect(reconcile).toContain("order by array_position(selected_arrival_ids, arrival.id)");
    expect(reconcile).toContain("where provenance_rank = 1");
    expect(reconcile).toContain("row_number() over (order by source.window_position");
    expect(migration).toContain("source_arrival_id uuid references public.warehouse_arrivals(id)");
    expect(migration).toContain("unique (singleton_key, window_position)");
  });

  it("publishes bounded partner and Dashboard reads from the same canonical membership", () => {
    expect(migration).toContain("create function public.get_partner_current_warehouse_replenishment_v2");
    expect(migration).toContain("p_limit not between 1 and 48");
    expect(migration).toContain("create function public.get_or_refresh_partner_dashboard_selections_v7");
    expect(migration).toContain("from public.current_warehouse_replenishment_items replenishment");
    expect(migration).toContain("'arrivalProducts', arrival_products");
    expect(migration).toContain("'arrivalCandidateCount', arrival_count");
    expect(migration).not.toContain("create trigger");
  });

  it("keeps browser roles away from private provenance and service-only orchestration", () => {
    expect(migration).toContain("set row_security = off");
    expect(migration).toContain("or not public.has_active_company_membership(p_company_id)");
    expect(migration).toContain("or not public.has_permission(p_company_id, 'catalog.view')");
    expect(migration).toContain("to service_role;");
    expect(migration).toContain("to authenticated;");
    expect(migration).not.toMatch(/grant select on (table )?public\.current_warehouse_replenishment_sources/i);
    expect(migration).not.toMatch(/grant select on (table )?public\.current_warehouse_replenishment_item_sources/i);
  });

  it("refreshes historical truth on activation and preserves canonical ordering for B2B and B2C", () => {
    expect(migration).toContain("select public.reconcile_current_warehouse_replenishment_day(false)");
    expect(migration).toContain("Partner ARRIVAL ordering patch did not match");
    expect(migration).toContain("Public ARRIVAL ordering patch did not match");
    expect(migration).toContain("p_merchandising_label = 'REPLENISHMENT'");
    expect(migration).toContain("p_mode = 'replenishment'");
  });
});

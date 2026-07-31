import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260731210000_partner_commercial_opportunities.sql"), "utf8");
const workerRepair = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260731211000_partner_commercial_opportunity_worker_repair.sql"), "utf8");
const uuidRepair = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260731212000_partner_commercial_opportunity_uuid_aggregate_repair.sql"), "utf8");
const windowRepair = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260731213000_partner_commercial_opportunity_window_repair.sql"), "utf8");
const permissionScopeRepair = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260731214000_partner_commercial_opportunity_permission_scope_repair.sql"), "utf8");

describe("commercial opportunity projection migration", () => {
  it("governs the complete deterministic opportunity catalog", () => {
    for (const type of ["repeat_purchase_available", "watched_product_back_in_stock", "relevant_product_arrival_confirmed", "relevant_product_price_decreased", "purchase_template_ready", "previous_order_repeatable", "relevant_merchandising_offer", "relevant_product_low_stock"]) expect(sql).toContain(`'${type}'`);
    expect(sql).not.toMatch(/machine.learning|ai_recommendation/i);
  });

  it("deduplicates product signals and keeps secondary reasons", () => {
    expect(sql).toContain("partition by signal.user_id, signal.product_id");
    expect(sql).toContain("where ranked.signal_rank = 1");
    expect(sql).toContain("secondary_reason_codes");
    expect(uuidRepair).toContain("array_agg(list.id order by list.id)");
    expect(uuidRepair).toContain("array_agg(template.id order by template.id)");
    expect(windowRepair).toContain("rows between unbounded preceding and unbounded following");
  });

  it("uses authoritative local sources without live 1C", () => {
    for (const table of ["partner_order_history", "purchase_templates", "purchasing_lists", "product_stock_totals", "product_supplier_arrivals", "product_price_history", "product_merchandising_assignments"]) expect(sql).toContain(`public.${table}`);
    expect(sql).not.toMatch(/StandardODATA|ONEC_|fetch\s*\(/);
  });

  it("enforces retail-only price comparison and the three-percent threshold", () => {
    expect(sql).toContain("not state.can_partner_price and state.can_retail_price");
    expect(sql).toContain("state.decrease_percent >= 3");
    expect(sql).toContain("external_price_type_code = 'UU-000020'");
    expect(sql).not.toContain("partner price against retail");
  });

  it("keeps private intent private and company templates shared", () => {
    expect(sql).toContain("list.visibility = 'company' or list.created_by = member.user_id");
    expect(sql).toContain("template.visibility = 'company' or template.owner_user_id = member.user_id");
    expect(sql).toContain("recipient_user_id = auth.uid()");
  });

  it("dismisses one state fingerprint without mutating another user", () => {
    expect(sql).toContain("primary key (recipient_user_id, commercial_state_fingerprint)");
    expect(sql).toContain("target.recipient_user_id <> auth.uid()");
  });

  it("uses affected-company dirty keys and a non-blocking projection worker", () => {
    expect(sql).toContain("partner_commercial_opportunity_dirty_companies");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("exception when others");
    expect(sql).not.toContain("cross join public.catalog_products");
    expect(workerRepair).toContain("failure_count");
    expect(workerRepair).toContain("for update skip locked");
  });

  it("exposes bounded partner and aggregate-only admin RPCs", () => {
    expect(sql).toContain("target_limit not between 1 and 50");
    expect(sql).toContain("limit target_limit offset target_offset");
    expect(sql).toContain("admin.opportunities.view");
    expect(sql).not.toContain("safe_reason_metadata jsonb_build_object('price'");
  });

  it("classifies partner and admin permissions in the canonical access projection", () => {
    expect(permissionScopeRepair).toContain("where code = 'opportunities.view'");
    expect(permissionScopeRepair).toContain("scope = 'partner'");
    expect(permissionScopeRepair).toContain("where code = 'admin.opportunities.view'");
    expect(permissionScopeRepair).toContain("scope = 'internal'");
  });
});

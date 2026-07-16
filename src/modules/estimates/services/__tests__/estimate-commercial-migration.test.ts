import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260716140000_estimate_commercial_controls.sql"), "utf8");
const repairSql = readFileSync(join(process.cwd(), "supabase/migrations/20260716143000_estimate_cost_snapshot_repair.sql"), "utf8");
const hardeningSql = readFileSync(join(process.cwd(), "supabase/migrations/20260716144500_estimate_commercial_rpc_hardening.sql"), "utf8");

describe("estimate commercial controls migration", () => {
  it("adds only the proven commercial aggregate fields and charges", () => {
    expect(sql).toContain("create table public.estimate_charges");
    for (const field of ["pricing_mode", "pricing_input_value", "line_discount_percent", "discount_percent", "global_discount_percent", "vat_mode", "currency_rate"]) {
      expect(sql).toContain(field);
    }
    expect(sql).not.toMatch(/create table public\.(leads|deals|pipelines|customers)/i);
  });

  it("guards the batch RPC by company permission, draft state, revision, ownership, and bounded payloads", () => {
    expect(sql).toContain("create or replace function public.save_estimate_commercial_draft");
    expect(sql).toContain("target.status <> 'draft'");
    expect(sql).toContain("public.can_access_estimates(target.company_id, 'estimates.manage')");
    expect(sql).toContain("public.can_access_estimates(target.company_id, 'estimates.pricing.manage')");
    expect(sql).toContain("target.revision <> expected_revision");
    expect(sql).toContain("jsonb_array_length(line_payload) > 500");
    expect(sql).toContain("item.estimate_id = target.id");
  });

  it("keeps writes behind RPCs and exposes charges read-only through RLS", () => {
    expect(sql).toContain("alter table public.estimate_charges enable row level security");
    expect(sql).toContain("grant select on table public.estimate_charges to authenticated");
    expect(sql).not.toMatch(/grant (insert|update|delete) on table public\.estimate_charges to authenticated/i);
    expect(sql).toContain("revoke all on function public.recalculate_estimate_totals(uuid) from public, anon, authenticated");
  });

  it("calculates totals in one transaction and preserves nullable incomplete prices", () => {
    expect(sql).toContain("perform public.recalculate_estimate_totals(target.id)");
    expect(sql).toContain("pricing_input_value numeric");
    expect(sql).toContain("when 'direct' then round(value.pricing_input_value, 2)");
    expect(sql).toContain("perform set_config('app.estimate_batch_update', 'on', true)");
  });

  it("repairs cross-currency legacy costs and never treats unknown cost as zero profit", () => {
    expect(repairSql).toContain("item.source_currency_code <> estimate.currency_code");
    expect(repairSql).toContain("set converted_cost_unit_price = null");
    expect(repairSql).toContain("has_missing_cost");
    expect(repairSql).toContain("case when has_missing_cost then null");
  });

  it("rejects batches that omit existing sections before entering the mutation", () => {
    expect(hardeningSql).toContain("current_section_count > jsonb_array_length(section_payload)");
    expect(hardeningSql).toContain("All existing estimate sections must be retained.");
    expect(hardeningSql).toContain("revoke all on function public.save_estimate_commercial_draft_impl");
  });
});

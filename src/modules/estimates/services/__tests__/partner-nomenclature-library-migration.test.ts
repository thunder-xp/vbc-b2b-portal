import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260809190000_partner_external_nomenclature_library.sql"), "utf8");

describe("partner external nomenclature library migration", () => {
  it("keeps shared identity separate from private company adoption", () => {
    expect(sql).toContain("create table public.partner_external_nomenclature_library");
    expect(sql).toContain("primary key (company_id, external_nomenclature_id)");
    expect(sql).toContain("status in ('active', 'archived')");
    expect(sql).toContain("external_nomenclature_items");
    expect(sql).not.toMatch(/create table public\.(partner_products|external_products)/i);
  });

  it("backfills creator and historical company usage without changing estimate history", () => {
    expect(sql).toContain("item.created_by_company_id");
    expect(sql).toContain("estimate_item.external_nomenclature_id");
    expect(sql).toContain("on conflict (company_id, external_nomenclature_id)");
    expect(sql).not.toMatch(/delete from public\.estimate_items/i);
  });

  it("uses bounded indexed own and shared searches without exposing company provenance", () => {
    expect(sql).toContain("create index partner_external_nomenclature_active_list_idx");
    expect(sql).toContain("create index external_nomenclature_compound_search_idx");
    expect(sql).toContain("create or replace function public.search_partner_external_nomenclature");
    expect(sql).toContain("create or replace function public.search_shared_external_nomenclature");
    expect(sql).toContain("least(greatest(coalesce(result_limit, 8), 1), 12)");
    expect(sql).toContain("own_library.company_id = target_company_id");
    expect(sql).toContain("item.normalized_manufacturer || item.normalized_model || item.normalized_name like");
    const sharedReturn = sql.slice(sql.indexOf("create or replace function public.search_shared_external_nomenclature"), sql.indexOf("create or replace function public.create_partner_external_nomenclature"));
    expect(sharedReturn).not.toMatch(/returns table[\s\S]*created_by_company_id/i);
    expect(sharedReturn).not.toMatch(/returns table[\s\S]*usage_count/i);
  });

  it("adopts a selected shared identity and inserts the estimate line atomically", () => {
    expect(sql).toContain("create or replace function public.add_estimate_external_item_v3");
    expect(sql).toContain("on conflict (company_id, external_nomenclature_id) do update");
    expect(sql).toContain("insert into public.estimate_items");
    expect(sql).toContain("when prior_library_status = 'archived' then 'reactivated'");
    expect(sql).toContain("else 'adopted'");
    expect(sql).toContain("select external_nomenclature_id into repeated_external_item_id");
    expect(sql).not.toContain("existing_request.external_nomenclature_id");
  });

  it("enforces company access through definer RPCs while denying direct table access", () => {
    expect(sql).toContain("alter table public.partner_external_nomenclature_library enable row level security");
    expect(sql).toContain("security definer\nset search_path = public");
    expect(sql).toContain("public.can_access_estimates(target_company_id, 'estimates.view')");
    expect(sql).toContain("public.can_access_estimates(target_company_id, 'estimates.manage')");
    expect(sql).toContain("revoke all on table public.partner_external_nomenclature_library");
    expect(sql).toContain("revoke all on function public.search_external_nomenclature(text, integer) from authenticated");
  });

  it("preserves anonymous shared identities and never introduces 1C fields", () => {
    expect(sql).toContain("item_type in ('equipment', 'material', 'service')");
    expect(sql).not.toMatch(/external_1c_id|Ref_Key|stock_quantity|warranty/i);
  });
});

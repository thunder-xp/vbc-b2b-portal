import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260808235900_estimate_external_nomenclature.sql"), "utf8").replace(/\r\n/g, "\n");
const idempotencyRepairSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260809002000_estimate_creation_idempotency_lock.sql"),
  "utf8",
);
const lineBatchRepairSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260809003000_estimate_line_batch_ordinality_repair.sql"),
  "utf8",
);

describe("estimate external nomenclature migration", () => {
  it("makes estimate creation idempotent without replacing the legacy RPC", () => {
    expect(sql).toContain("create or replace function public.create_estimate_v2");
    expect(sql).toContain("estimates_creator_creation_request_unique");
    expect(sql).toContain("creation_request_key = target_request_key");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(idempotencyRepairSql).toContain("pg_advisory_xact_lock");
    expect(idempotencyRepairSql).toContain("auth.uid()::text || ':' || target_request_key::text");
    expect(sql).not.toContain("drop function public.create_estimate(");
  });

  it("keeps shared external identity separate from catalog and 1C truth", () => {
    expect(sql).toContain("create table public.external_nomenclature_items");
    expect(sql).toContain("external_nomenclature_id");
    expect(sql).toContain("line_type = 'external'");
    expect(sql).not.toMatch(/external_nomenclature_items[\s\S]{0,600}(external_1c|ref_key|stock|partner_price)/i);
  });

  it("uses bounded indexed search and never exposes creator tenancy", () => {
    expect(sql).toContain("external_nomenclature_search_idx");
    expect(sql).toContain("least(greatest(coalesce(result_limit, 8), 1), 12)");
    expect(sql).toContain("returns table (");
    expect(sql.match(/returns table \([\s\S]*?\)\nlanguage plpgsql/)?.[0]).not.toMatch(/created_by|company_id/);
  });

  it("blocks direct partner table access and exposes guarded RPCs only", () => {
    expect(sql).toContain("alter table public.external_nomenclature_items enable row level security");
    expect(sql).toContain("revoke all on table public.external_nomenclature_items");
    expect(sql).toContain("public.can_access_estimates(target.company_id, 'estimates.pricing.manage')");
    expect(sql).toContain("grant execute on function public.search_external_nomenclature");
  });

  it("warns on authoritative manufacturer and model duplicates but permits explicit override", () => {
    expect(sql).toContain("item.normalized_manufacturer = normalized_manufacturer");
    expect(sql).toContain("item.normalized_model = normalized_model");
    expect(sql).toContain("not force_create_new");
    expect(sql).toContain("A matching external nomenclature item already exists.");
  });

  it("keeps the line-batch RPC compatible with current PostgreSQL ordinality syntax", () => {
    expect(lineBatchRepairSql).toContain("jsonb_array_elements(line_items) with ordinality as entry(value, ordinality)");
    expect(lineBatchRepairSql).not.toContain("jsonb_to_recordset(line_items) with ordinality");
    expect(lineBatchRepairSql).toContain("create or replace function public.add_estimate_items");
  });
});

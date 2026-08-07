import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260806220000_warranty_serial_evidence.sql"), "utf8");
const mappingIndexSql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260807001500_warranty_serial_mapping_indexes.sql"), "utf8");
const setBasedRebuildSql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260807010500_warranty_serial_set_based_rebuild.sql"), "utf8");
const batchedRebuildSql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260807013000_warranty_serial_batched_rebuild.sql"), "utf8");
const terminalGuardSql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260807014500_warranty_serial_rebuild_terminal_guard.sql"), "utf8");
const partnerPermissionScopeSql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260807220000_warranty_serial_partner_permission_scope.sql"), "utf8");

describe("warranty serial migration contract", () => {
  it("indexes exact normalized company and product mapping used during publication", () => {
    expect(mappingIndexSql).toContain("on public.one_c_counterparties(lower(external_1c_id))");
    expect(mappingIndexSql).toContain("on public.catalog_products(lower(external_1c_id))");
  });

  it("rebuilds derived state as a set-based indexed projection", () => {
    expect(setBasedRebuildSql).toContain("select distinct on (event.normalized_serial_hash)");
    expect(setBasedRebuildSql).toContain("insert into public.warranty_serial_state");
    expect(setBasedRebuildSql).toContain("get diagnostics rebuilt=row_count");
    expect(setBasedRebuildSql).not.toContain("for target_hash in");
  });

  it("resumes large production rebuilds through a bounded cursor", () => {
    expect(batchedRebuildSql).toContain("add column if not exists rebuild_cursor text");
    expect(batchedRebuildSql).toContain("limit p_limit");
    expect(batchedRebuildSql).toContain("rebuild_warranty_serial_states_batch(p_run_id,run.rebuild_cursor,250)");
    expect(batchedRebuildSql).toContain("status=case when terminal then 'succeeded' else status end");
  });

  it("finishes only when no event hash remains after the rebuild cursor", () => {
    expect(terminalGuardSql).toContain("normalized_serial_hash>coalesce(last_hash,'')");
    expect(terminalGuardSql).toContain("delete from public.warranty_serial_state");
    expect(terminalGuardSql).toContain("safe_error_code='rebuild_terminal_guard_corrected'");
    expect(terminalGuardSql).not.toContain("terminal:=(batch->>'complete')::boolean");
  });
  it("creates immutable event history and rebuildable state behind RLS", () => {
    expect(sql).toContain("create table public.warranty_serial_events");
    expect(sql).toContain("create table public.warranty_serial_state");
    expect(sql).toContain("warranty_serial_events_immutable");
    expect(sql).toContain("alter table public.warranty_serial_events enable row level security");
    expect(sql).toContain("from public,anon,authenticated");
  });

  it("keeps old service case RPC and adds a versioned atomic handoff", () => {
    expect(sql).toContain("create or replace function public.create_service_case_v2");
    expect(sql).not.toContain("drop function public.create_service_case");
    expect(sql).toContain("warranty_verification_snapshot");
  });

  it("requires complete fresh reversal evidence before coverage", () => {
    expect(sql).toContain("run.sales_scan_complete and run.returns_scan_complete");
    expect(sql).toContain("reversal_scan_incomplete_or_stale");
    expect(sql).toContain("now() at time zone 'Europe/Chisinau'");
    expect(sql).toContain("ownership:='resold'");
  });

  it("uses bounded resumable scans and protects partner lookup scope", () => {
    expect(sql).toContain("page_size between 1 and 100");
    expect(sql).toContain("run.pages_fetched>=4000");
    expect(sql).toContain("last_sale_company_id=p_company_id");
    expect(sql).toContain("Serial verification rate limit exceeded");
  });

  it("keeps serial verification in the canonical partner permission projection", () => {
    expect(partnerPermissionScopeSql).toContain("set scope = 'partner'");
    expect(partnerPermissionScopeSql).toContain("code = 'service.serial.verify'");
    expect(partnerPermissionScopeSql).toContain("'full_partner_access'");
    expect(partnerPermissionScopeSql).toContain("on conflict do nothing");
  });
});

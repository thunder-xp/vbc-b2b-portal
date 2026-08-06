import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql=readFileSync(resolve(process.cwd(),"supabase/migrations/20260806133000_stock_reconciliation_and_snapshot_time.sql"),"utf8");

describe("stock reconciliation migration",()=>{
  it("captures source zero versus stale positive before authoritative publication",()=>{expect(sql).toContain("source_zero_local_positive");expect(sql).toContain("source.physical - source.reserved");expect(sql).toContain("publish_exact_stock_snapshot_reconciliation_base(p_sync_id)");});
  it("stores publication provenance and full-snapshot freshness",()=>{expect(sql).toContain("source_fingerprint");expect(sql).toContain("warehouse_scope_version");expect(sql).toContain("freshness_state = 'authoritative'");expect(sql).toContain("published_at");});
  it("keeps diagnostics internal and bounded",()=>{expect(sql).toContain("has_internal_permission('admin.stock.view')");expect(sql).toContain("p_limit > 100");expect(sql).toContain("revoke all on public.stock_reconciliation_runs");expect(sql).not.toContain("grant select on public.stock_reconciliation_runs to authenticated");});
  it("retains the single governed public warehouse policy",()=>{expect(sql).toContain("86197770-0aac-431a-aad6-8e7099029bbb");expect(sql).toContain("warehouse.public_included");});
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260806220000_warranty_serial_evidence.sql"), "utf8");
const mappingIndexSql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260807001500_warranty_serial_mapping_indexes.sql"), "utf8");

describe("warranty serial migration contract", () => {
  it("indexes exact normalized company and product mapping used during publication", () => {
    expect(mappingIndexSql).toContain("on public.one_c_counterparties(lower(external_1c_id))");
    expect(mappingIndexSql).toContain("on public.catalog_products(lower(external_1c_id))");
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
});

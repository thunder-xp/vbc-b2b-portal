import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260921044017_stock_incoming_scan_self_healing.sql"),
  "utf8",
);

describe("stock source self-healing migration", () => {
  it("persists run history, per-call evidence, and independent freshness", () => {
    expect(sql).toContain("create table public.stock_sync_run_history");
    expect(sql).toContain("create table public.stock_sync_source_operations");
    expect(sql).toContain("create table public.stock_sync_domain_freshness");
    expect(sql).toContain("source_normalized_rows integer not null default 0");
    expect(sql).toContain("stock_source_staged_rows integer not null default 0");
    expect(sql).toContain("incoming_source_staged_rows integer not null default 0");
    expect(sql).toContain("'physical_stock'::text");
    expect(sql).toContain("'supplier_arrivals'::text");
  });

  it("resumes a retryable run without deleting its checkpoint staging", () => {
    const resume = sql.slice(
      sql.indexOf("create function public.resume_failed_stock_sync"),
      sql.indexOf("create function public.heartbeat_stock_sync_scheduler"),
    );
    expect(resume).toContain("active_sync_id = last_failed_sync_id");
    expect(resume).toContain("current_stage = failed_stage");
    expect(resume).not.toContain("delete from public.stock_balance_sync_stage");
  });

  it("keeps the watchdog bounded and protects all new diagnostic data", () => {
    expect(sql).toContain("recovery_attempt_count < 3");
    expect(sql).toContain("interval '1 minute'");
    expect(sql).toContain("interval '5 minutes'");
    expect(sql).toContain("interval '15 minutes'");
    expect(sql.match(/enable row level security/g)?.length).toBe(3);
    expect(sql).toContain("revoke all on table public.stock_sync_source_operations from public, anon, authenticated");
  });
});

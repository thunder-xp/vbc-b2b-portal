import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.resolve("supabase/migrations/20260715190000_commercial_freshness_automation.sql"), "utf8");

describe("commercial freshness automation migration", () => {
  it("acquires history locks atomically and supports stale recovery", () => {
    expect(sql).toContain("acquire_partner_order_history_sync");
    expect(sql).toContain("on conflict (company_id) do update");
    expect(sql).toContain("stale_lock_recovered");
  });

  it("supports the indexed bounded active-order predicate", () => {
    expect(sql).toContain("partner_order_history_active_refresh_idx");
    expect(sql).toContain("one_c_last_synced_at, company_id, id");
    expect(sql).toContain("one_c_posted = false or one_c_state_code is distinct from 'completed'");
  });

  it("prevents an older commercial rate from replacing the current publication", () => {
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("current_rate.source_document_date > p_source_document_date");
    expect(sql).toContain("return to_jsonb(current_rate)");
  });

  it("keeps stock start atomic and blocks price or catalog publication overlap", () => {
    expect(sql).toContain("create or replace function public.start_exact_stock_sync()");
    expect(sql).toContain("blocked_price");
    expect(sql).toContain("blocked_catalog");
    expect(sql).toContain("for update");
  });
});

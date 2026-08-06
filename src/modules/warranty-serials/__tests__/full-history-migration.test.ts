import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260806234500_warranty_serial_full_history.sql"),
  "utf8",
);
const resumeSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260806235500_warranty_serial_single_resume.sql"),
  "utf8",
);

describe("warranty serial full-history migration", () => {
  it("uses the earliest verified source year for full and historical scans", () => {
    expect(sql).toContain("verified_history_start constant date:=date '2018-01-01'");
    expect(sql).toContain("then verified_history_start else business_date-90 end");
  });

  it("rewinds only an unfinished initial full scan without deleting evidence", () => {
    expect(sql).toContain("where mode='full'");
    expect(sql).toContain("and current_stage<>'completed'");
    expect(sql).toContain("and not exists(select 1 from public.warranty_serial_sync_runs where status='succeeded')");
    expect(sql).not.toMatch(/delete\s+from\s+public\.warranty_serial_(events|state)/i);
  });

  it("keeps the recent incremental window bounded", () => {
    expect(sql).toContain("else business_date-90 end");
    expect(sql).toContain("pg_advisory_xact_lock(hashtext('warranty_serial_sync_claim'))");
  });

  it("never resumes superseded bootstrap attempts", () => {
    expect(resumeSql).toContain("safe_error_code='superseded_full_bootstrap'");
    expect(resumeSql).toContain("safe_error_code is distinct from 'superseded_full_bootstrap'");
    expect(resumeSql).toContain("order by pages_fetched desc,started_at desc limit 1");
  });
});

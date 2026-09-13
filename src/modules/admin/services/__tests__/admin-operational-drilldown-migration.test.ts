import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260913092304_admin_operations_error_drilldown.sql"),
  "utf8",
);
const repairSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260913095735_repair_admin_operational_issue_json_paths.sql"),
  "utf8",
);

describe("Admin operational drilldown migration", () => {
  it("defines the complete health taxonomy including successful empty", () => {
    for (const state of ["HEALTHY", "RUNNING", "DEGRADED", "FAILED", "STALE", "NEVER_SYNCED", "SUCCESS_EMPTY"]) {
      expect(sql).toContain(state);
    }
    expect(sql).toContain("supplier_arrivals_published, 0) = 0 then 'SUCCESS_EMPTY'");
  });

  it("uses one bounded dashboard RPC and derives its count from the active list", () => {
    expect(sql).toContain("public.get_admin_dashboard_projection");
    expect(sql).toContain("v_issues := public.list_admin_operational_issues(p_now)");
    expect(sql).toContain("'criticalCount', jsonb_array_length(v_issues)");
    expect(sql).not.toMatch(/create table[\s\S]*operational_issue/i);
    expect(sql).not.toMatch(/poll|setinterval/i);
  });

  it("preserves run identity and exposes only safe aggregate fields", () => {
    expect(sql).toContain("last_failed_sync_id");
    expect(sql).toContain("'correlationId'");
    expect(sql).toContain("'safeErrorCode'");
    expect(sql).not.toMatch(/authorization|credential|password|service_role/i);
  });

  it("requires an internal permission and revokes public/anon execution", () => {
    expect(sql).toContain("public.has_internal_permission('admin.dashboard.view')");
    expect(sql).toContain("public.has_internal_permission('admin.integrations.view')");
    expect(sql).toContain("from public, anon");
    expect(sql).toContain("set search_path = ''");
  });

  it("builds issue identifiers and deep links without text/jsonb operator ambiguity", () => {
    expect(repairSql).toContain("format('%s:%s', health.value->>'key'");
    expect(repairSql).toContain("format('/admin/operations/issues/%s:%s', health.value->>'key'");
    expect(repairSql).not.toContain("'/admin/operations/issues/' || health.value");
  });
});

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260829104324_partner_order_history_incremental_sync.sql"), "utf8");

describe("partner order-history incremental migration", () => {
  it("adds one Date cursor and bounded exact-verification state", () => {
    expect(sql).toContain("incremental_date_watermark");
    expect(sql).toContain("last_existence_verified_at");
    expect(sql).toContain("last_existence_result");
    expect(sql).toContain("get_partner_order_history_existence_candidates");
    expect(sql).toContain("greatest(1, least(p_limit, 25))");
  });

  it("persists run-level source, delta, database, and latency metrics", () => {
    for (const field of [
      "headers_received", "new_orders", "changed_orders", "unchanged_orders", "line_requests",
      "existence_refs_checked", "one_c_request_count", "one_c_duration_ms", "db_writes", "total_duration_ms",
    ]) expect(sql).toContain(field);
  });

  it("uses set-based delta item replacement only for supplied changed rows", () => {
    expect(sql).toContain("upsert_partner_order_history_delta_batch");
    expect(sql).toContain("delete from public.partner_order_history_items item");
    expect(sql).toContain("using order_history_delta_saved saved");
    expect(sql).not.toContain("for source_order in");
  });

  it("requires two matching passes before any unseen reference is hidden", () => {
    expect(sql).toContain("pass_one_set_hash is distinct from set_hash");
    expect(sql).toContain("pass_one_version_hash is distinct from version_hash");
    expect(sql).toContain("conflicting_version_count = conflicting_version_count + conflicting_rows + prior_conflicting_rows");
    expect(sql).toMatch(/if target\.pass_one_count[\s\S]+return jsonb_build_object\('status', 'integrity_failed', 'hidden', 0\);[\s\S]+update public\.partner_order_history history set/);
  });

  it("keeps internal tables private and privileged helpers server-only", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("has_internal_permission('admin.integrations.manage')");
  });
});

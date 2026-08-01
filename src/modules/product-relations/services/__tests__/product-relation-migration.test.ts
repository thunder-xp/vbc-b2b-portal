import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260801190000_product_relations_foundation.sql"), "utf8");

describe("product relation migration", () => {
  it("creates a server-owned RLS-protected snapshot and staging model", () => {
    for (const table of ["product_relations", "product_relation_sync_stage", "product_relation_sync_runs", "product_relation_sync_rejections"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
    }
    expect(sql.replace(/\s+/g, " ")).not.toMatch(/grant (insert|update|delete).*product_relations.*authenticated/i);
  });

  it("publishes atomically and preserves directionality", () => {
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("delete from public.product_relations");
    expect(sql).toContain("source_product_id, target_product_id, relation_type");
    expect(sql).not.toContain("target.id, source.id, ranked.relation_type");
    expect(sql).toContain("constraint product_relations_not_self");
    expect(sql).toContain("constraint product_relations_logical_unique");
  });

  it("enforces canonical visibility, deterministic ranking, and five-row bounds", () => {
    expect(sql).toContain("target.is_active and target.is_visible");
    expect(sql).toContain("order by relation.sort_order");
    expect(sql).toContain("stock.available_quantity");
    expect(sql).toContain("rank <= least(greatest(p_limit, 1), 5)");
    expect(sql).toContain("public.has_internal_permission('admin.integrations.view')");
  });

  it("retains required data-quality exclusion diagnostics", () => {
    for (const reason of ["unmapped_source", "unmapped_target", "inactive_target", "unpublished_target", "outside_scope_source", "outside_scope_target", "self_relation", "duplicate_row", "invalid_characteristic"]) {
      expect(sql).toContain(`'${reason}'`);
    }
  });
});

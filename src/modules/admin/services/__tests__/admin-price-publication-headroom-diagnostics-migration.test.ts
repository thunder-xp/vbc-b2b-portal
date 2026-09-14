import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260914135500_admin_price_publication_headroom_diagnostics.sql",
), "utf8");

describe("admin price publication headroom diagnostics migration", () => {
  it("extends the existing integration-center read without a second page query", () => {
    expect(sql).toContain("get_admin_integration_center_base()");
    expect(sql).toContain("'pricePublication'");
    expect(sql).toContain("state.rows_staged");
    expect(sql).toContain("state.delta_unchanged");
    expect(sql).toContain("state.delta_inserted");
    expect(sql).toContain("state.delta_updated");
    expect(sql).toContain("state.delta_removed");
    expect(sql).toContain("state.publication_batches");
    expect(sql).toContain("state.publication_db_duration_ms");
    expect(sql).toContain("state.publication_timeout_budget_ms");
    expect(sql).toContain("state.publication_headroom_percent");
    expect(sql).toContain("state.publication_warning");
  });

  it("keeps the base projection server-only and the existing admin permission boundary", () => {
    expect(sql).toContain("revoke all on function public.get_admin_integration_center_base()");
    expect(sql).toContain("from public, anon, authenticated, service_role");
    expect(sql).toContain("grant execute on function public.get_admin_integration_center()\nto authenticated");
  });
});

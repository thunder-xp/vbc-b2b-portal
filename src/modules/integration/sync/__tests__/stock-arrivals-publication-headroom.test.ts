import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260914145405_stock_arrivals_publication_delta_headroom.sql",
  ),
  "utf8",
);

describe("stock and arrivals publication headroom", () => {
  it("uses one bounded publication owner without raising the timeout", () => {
    expect(sql).toContain("pg_try_advisory_xact_lock");
    expect(sql).toContain("'exact_stock_publication'");
    expect(sql).toContain("using errcode = '55P03'");
    expect(sql).not.toMatch(/set\s+(local\s+)?statement_timeout/i);
  });

  it("does not rewrite unchanged stock and arrival rows", () => {
    expect(sql).toContain("stock_delta_unchanged");
    expect(sql).toContain("arrivals_delta_unchanged");
    expect(sql).toContain("is distinct from row(excluded.physical_quantity");
    expect(sql).toContain("is distinct from row(excluded.expected_quantity, true)");
    expect(sql).toContain("and (current.is_active or current.is_published)");
    expect(sql).toContain("where current.is_published and not exists");
  });

  it("bypasses supplier source-line rewrites only for a proven no-change payload", () => {
    expect(sql).toContain(
      "rename to publish_exact_stock_snapshot_current_replenishment_legacy_base",
    );
    expect(sql).toContain("v_has_source_delta");
    expect(sql).toContain(
      "return public.publish_exact_stock_snapshot_current_replenishment_legacy_base",
    );
    expect(sql).toContain("'supplier_source_delta', false");
  });

  it("preserves authoritative zero quantities", () => {
    expect(sql).toContain(
      "greatest(0, desired.physical_quantity - desired.reserved_quantity)",
    );
    expect(sql).not.toMatch(/stock_balance_sync_stage[^;]+stage\.quantity\s*>\s*0/i);
  });

  it("publishes stock and arrivals atomically before deleting staging", () => {
    expect(sql.indexOf("insert into public.product_stock_balances as current")).toBeGreaterThan(-1);
    expect(sql.indexOf("insert into public.product_supplier_arrivals as current")).toBeGreaterThan(-1);
    expect(sql.lastIndexOf("delete from public.supplier_order_item_stage")).toBeGreaterThan(
      sql.indexOf("insert into public.product_supplier_arrivals as current"),
    );
  });

  it("exposes one failed root incident with both affected domains", () => {
    expect(sql).toContain("jsonb_build_array('stock', 'arrivals')");
    expect(sql).toContain("expanded.value->>'key' = 'arrivals'");
    expect(sql).toContain("state.status = 'failed'");
  });

  it("retains exact publication diagnostics", () => {
    for (const field of [
      "publication_db_ms",
      "publication_application_ms",
      "publication_timeout_budget_ms",
      "publication_headroom_percent",
      "publication_lock_wait_ms",
      "publication_trigger_rows",
    ]) {
      expect(sql).toContain(field);
    }
  });
});

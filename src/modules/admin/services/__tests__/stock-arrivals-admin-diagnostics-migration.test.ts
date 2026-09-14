import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260914154000_stock_arrivals_active_admin_diagnostics.sql",
  ),
  "utf8",
);

describe("stock and arrivals active Admin diagnostics migration", () => {
  it("adds the diagnostics to the existing integration-center read", () => {
    expect(sql).toContain("create or replace function public.get_admin_integration_center()");
    expect(sql).toContain("'stockPublication'");
    expect(sql).toContain("'affectedDomains', jsonb_build_array('stock', 'arrivals')");
  });

  it("does not add another database request or expose the publisher", () => {
    expect(sql).toContain("public.get_admin_integration_center_base()");
    expect(sql).toContain("state.publication_db_ms");
    expect(sql).not.toContain("grant execute on function public.publish_exact_stock_snapshot");
  });

  it("uses the schema-matched transition product key", () => {
    expect(sql).toContain("'product_id', snapshot.product_id");
    expect(sql).not.toContain("'productId', snapshot.product_id");
    expect(sql).toContain("as value(product_id uuid, state text)");
  });
});

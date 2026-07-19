import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260719120000_catalog_query_plan_diagnostic.sql"),
  "utf8",
);

describe("catalog query-plan diagnostic SQL", () => {
  it("accepts only the fixed operation allowlist and never user SQL", () => {
    expect(migration).toContain("p_operation not in ('catalog_page', 'catalog_facets', 'exact_sku', 'attribute_filter', 'stock_sort')");
    expect(migration).not.toContain("p_sql");
    expect(migration).not.toMatch(/execute\s+p_operation/i);
  });

  it("is service-role only and bounded", () => {
    expect(migration).toContain("auth.role() <> 'service_role'");
    expect(migration).toContain("set_config('statement_timeout', '5000', true)");
    expect(migration).toContain("explain (analyze, buffers, format json)");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });
});

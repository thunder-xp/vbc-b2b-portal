import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../../../../../supabase/migrations/20260921093210_public_retail_candidate_delta_build.sql",
  import.meta.url,
);
const writeHeadroomMigrationUrl = new URL(
  "../../../../../supabase/migrations/20260921123500_public_retail_search_write_headroom.sql",
  import.meta.url,
);

describe("stock no-change Public Retail projection", () => {
  it("skips only a complete numeric zero delta and fails malformed deltas closed", () => {
    const migration = readFileSync(migrationUrl, "utf8");

    for (const field of ["stockRows", "deactivated", "arrivalRows"]) {
      expect(migration).toContain(`jsonb_typeof(p_changed_counts -> '${field}') = 'number'`);
      expect(migration).toContain(`(p_changed_counts ->> '${field}')::numeric = 0`);
    }
    expect(migration).toMatch(/p_source_domain = 'stock'[\s\S]*public_retail_projection_status = case[\s\S]*then 'skipped'/);
    expect(migration).toMatch(/revoke all on function public\.build_public_retail_candidate\(uuid\)[\s\S]*from public, anon, authenticated/);
    expect(migration).toContain("grant execute on function public.build_public_retail_candidate(uuid) to service_role");
  });

  it("does not maintain a trigram index across immutable historical generations", () => {
    const migration = readFileSync(writeHeadroomMigrationUrl, "utf8");
    expect(migration).toContain("drop index if exists public.public_retail_products_publication_search_idx");
  });
});

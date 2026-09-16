import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260916132300_skip_no_change_price_public_projection.sql",
  "utf8",
);

describe("no-change price projection completion", () => {
  it("finishes a proven price no-op without rebuilding Public Retail", () => {
    expect(migration).toContain("p_source_domain = 'prices'");
    expect(migration).toContain("jsonb_typeof(p_changed_counts -> 'prices') = 'number'");
    expect(migration).toContain("jsonb_typeof(p_changed_counts -> 'deactivated') = 'number'");
    expect(migration).toContain("(p_changed_counts ->> 'prices')::numeric = 0");
    expect(migration).toContain("(p_changed_counts ->> 'deactivated')::numeric = 0");
    expect(migration).toMatch(/public_retail_projection_status = case[\s\S]*then 'skipped'/);
    expect(migration).toMatch(/public_retail_publication_status = case[\s\S]*then 'skipped'/);
    expect(migration).toMatch(/overall_status = case[\s\S]*then 'succeeded'/);
  });

  it("fails closed for incomplete or non-price change evidence", () => {
    expect(migration).toMatch(/jsonb_typeof\(p_changed_counts -> 'prices'\) = 'number'/);
    expect(migration).toMatch(/jsonb_typeof\(p_changed_counts -> 'deactivated'\) = 'number'/);
    expect(migration).toMatch(/else public_retail_projection_status/);
    expect(migration).toMatch(/else public_retail_publication_status/);
  });

  it("keeps the privileged completion boundary server-only", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toMatch(/revoke all on function[\s\S]*from public, anon, authenticated/);
    expect(migration).toMatch(/grant execute on function[\s\S]*to service_role/);
  });
});

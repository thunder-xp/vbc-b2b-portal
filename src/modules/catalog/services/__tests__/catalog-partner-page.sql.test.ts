import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260719090000_catalog_partner_page_aggregate.sql"),
  "utf8",
);

describe("catalog_partner_page SQL", () => {
  it("uses allowlisted database sorting and paginates before returning rows", () => {
    expect(migration).toContain("p_sort not in");
    expect(migration).toContain("row_number() over (order by");
    expect(migration).toContain("where ordinal > p_offset and ordinal <= p_offset + p_limit");
    expect(migration).not.toContain("execute format(");
  });

  it("keeps missing commercial values last with deterministic product ordering", () => {
    expect(migration).toContain("asc nulls last");
    expect(migration).toContain("desc nulls last");
    expect(migration).toContain("lower(c.name), c.id");
  });

  it("enforces partner company access and does not grant anonymous execution", () => {
    expect(migration).toContain("public.has_active_company_membership(p_company_id)");
    expect(migration).toContain("public.has_permission(p_company_id, 'catalog.view')");
    expect(migration).toContain("from public, anon");
    expect(migration).not.toMatch(/grant execute[\s\S]*to anon/);
  });
});

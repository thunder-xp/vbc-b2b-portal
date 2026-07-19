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

  it("prioritizes exact and prefix SKU search without scanning descriptions for short input", () => {
    expect(migration).toContain("when lower(p.sku) = lower(btrim(p_search)) then 0");
    expect(migration).toContain("when lower(p.sku) like lower(btrim(p_search)) || '%' then 1");
    expect(migration).toContain("char_length(btrim(p_search)) >= 3 and p.short_description ilike");
  });
});

const facetMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260719100000_catalog_scoped_facets.sql"),
  "utf8",
);

describe("catalog_partner_facets SQL", () => {
  it("batches current category, search, availability, and attribute scope", () => {
    expect(facetMigration).toContain("create or replace function public.catalog_partner_facets");
    expect(facetMigration).toContain("p_category_id");
    expect(facetMigration).toContain("p_search");
    expect(facetMigration).toContain("p_availability");
    expect(facetMigration).toContain("selected_filter.key <> candidate.attribute_key");
  });

  it("bounds values per facet while retaining selected values", () => {
    expect(facetMigration).toContain("partition by counted.attribute_key");
    expect(facetMigration).toContain("ranked.value_rank <= p_max_values");
    expect(facetMigration).toContain("p_filters -> ranked.attribute_key");
  });
});

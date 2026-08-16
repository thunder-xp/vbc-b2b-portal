import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260816090707_public_retail_catalog_parity_and_special_offers.sql"), "utf8");

describe("Public Retail catalog parity migration", () => {
  it("implements B2B contextual facet semantics in one bounded public aggregate", () => {
    const facetSql = sql.slice(
      sql.indexOf("create or replace function public.list_public_retail_facets_v2"),
      sql.indexOf("revoke all on function public.list_public_retail_facets_v2"),
    );

    expect(sql).toContain("create or replace function public.list_public_retail_facets_v2");
    expect(sql).toContain("selected_filter.key <> candidate.value->>'key'");
    expect(sql).toContain("selected.value->>'value' in (select jsonb_array_elements_text(selected_filter.value))");
    expect(sql).toContain("count(distinct product.public_id) product_count");
    expect(sql).toContain("p_max_values not between 1 and 50");
    expect(sql).toContain("revoke all on function public.list_public_retail_facets(text,text)");
    expect(sql).toContain("Deprecated non-contextual Public Retail facet projection");
    expect(facetSql).not.toMatch(/for each.*product|http|one_c/);
  });

  it("uses an audited Retail marker instead of cheapest-price substitution", () => {
    expect(sql).toContain("'SPECIAL_OFFER'");
    expect(sql).toContain("p_mode = 'special' and 'SPECIAL_OFFER' = any(product.merchandising_labels)");
    expect(sql).toContain("case when p_mode = 'special' then special_offer_priority end desc");
    expect(sql).not.toMatch(/p_mode = 'special' then retail_price_amount/);
    expect(sql).toContain("product_merchandising_audit_events");
  });

  it("keeps the partner merchandising projection restricted to its existing labels", () => {
    expect(sql).toContain("assignment.label_code in ('NEW', 'TOP', 'HOT')");
    expect(sql).toContain("p_label_code not in ('NEW', 'TOP', 'HOT')");
  });
});

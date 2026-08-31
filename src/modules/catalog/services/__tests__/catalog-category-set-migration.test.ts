import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260831093010_support_b2b_catalog_quick_category_sets.sql"),
  "utf8",
);

describe("B2B catalog category-set migration", () => {
  it("keeps page and facets bounded in one RPC contract", () => {
    expect(sql).toContain("catalog_partner_page_v6");
    expect(sql).toContain("catalog_partner_facets_v3");
    expect(sql).toContain("p_category_ids uuid[]");
    expect(sql).toContain("p_limit not between 1 and 48");
    expect(sql).toContain("coalesce(cardinality(p_category_ids), 0) > 3");
  });

  it("fails closed for category sets outside the exact governed 1C allowlist", () => {
    expect(sql).toContain("category.external_1c_id <> all");
    expect(sql).toContain("Invalid catalog category set.");
    expect(sql).toContain("revoke all on function public.catalog_partner_page_category_set_base");
    expect(sql).toContain("from public, anon, authenticated");
  });

  it("preserves the canonical permission and commercial projection boundaries", () => {
    expect(sql).toContain("public.has_active_company_membership(p_company_id)");
    expect(sql).toContain("public.has_permission(p_company_id, 'catalog.view')");
    expect(sql).toContain("public.catalog_card_characteristic_priority");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
  });
});

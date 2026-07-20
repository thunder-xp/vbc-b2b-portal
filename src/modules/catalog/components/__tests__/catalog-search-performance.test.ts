import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const route = source("app/api/catalog/search/route.ts");
const action = source("src/modules/catalog/actions/search-suggestions.action.ts");
const component = source("src/modules/catalog/components/CatalogSearch.tsx");
const migration = source("supabase/migrations/20260720230000_catalog_search_suggestions.sql");

describe("compact catalog search path", () => {
  it("uses the dedicated suggestion action instead of the full catalog page", () => {
    expect(route).toContain("searchCatalogSuggestionsAction");
    expect(route).not.toContain("listCatalogProductsAction");
    expect(action).toContain(".searchSuggestions(userId, input)");
  });

  it("does not fetch or render commercial data in typeahead results", () => {
    expect(component).not.toContain("ProductCommercialViewDto");
    expect(component).not.toContain("commercialViews");
    expect(component).not.toContain("partnerPrice");
    expect(component).not.toContain("stock?.label");
  });

  it("keeps the compact RPC access-scoped and bounded", () => {
    expect(migration).toContain("has_active_company_membership(p_company_id)");
    expect(migration).toContain("has_permission(p_company_id, 'catalog.view')");
    expect(migration).toContain("p_limit not between 1 and 10");
    expect(migration).toContain("revoke all on function public.catalog_search_suggestions");
    expect(migration).not.toContain("price_amount");
    expect(migration).not.toContain("available_quantity");
  });

  it("ranks exact and prefix SKU matches deterministically", () => {
    expect(migration).toContain("lower(product.sku) = normalized_query then 0");
    expect(migration).toContain("lower(product.sku) like normalized_query || '%' then 1");
    expect(migration).toContain("order by matches.search_rank, lower(matches.name), matches.id");
  });
});

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

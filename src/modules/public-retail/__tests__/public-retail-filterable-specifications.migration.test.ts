import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260816124904_expose_public_retail_filterable_specifications.sql"),
  "utf8",
);
const productPage = readFileSync(join(process.cwd(), "app/products/[slug]/page.tsx"), "utf8");

describe("public retail filterable specifications migration", () => {
  it("projects governed filterability through the existing bounded product RPC", () => {
    expect(migration).toContain("create or replace function public.get_public_retail_product");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("attribute.is_filterable");
    expect(migration).toContain("attribute.is_visible");
    expect(migration).toContain("attribute.resolution_status in ('not_required', 'resolved')");
    expect(migration).toContain("coalesce(attribute.resolved_display_value, attribute.display_value) = value->>'value'");
    expect(migration).not.toContain("partner_price");
    expect(migration).not.toContain("warehouse");
  });

  it("keeps anonymous access on the public-safe RPC only", () => {
    expect(migration).toContain("revoke all on function public.get_public_retail_product(text,text) from public");
    expect(migration).toContain("grant execute on function public.get_public_retail_product(text,text) to anon, authenticated");
  });

  it("links only explicitly filterable product-detail values through the shared facet contract", () => {
    expect(productPage).toContain("item.filterable && /^property_[0-9a-f-]{36}$/.test(item.key)");
    expect(productPage).toContain("publicRetailFilterHref(locale");
    expect(productPage).toContain('facetMode: "include"');
  });
});

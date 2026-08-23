import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260823170057_public_retail_seo_content_and_related_products.sql"), "utf8");

describe("public related-products migration", () => {
  it("uses one bounded public-safe projection read and stable ranking", () => {
    expect(migration).toContain("list_public_retail_related_products");
    expect(migration).toContain("p_limit not between 1 and 6");
    expect(migration).toContain("candidate.category_public_id = candidate_category.public_id");
    expect(migration).toContain("sibling.parent_public_id = target_category.parent_public_id");
    expect(migration).toContain("shared_specifications desc");
    expect(migration).toContain("build_public_retail_product_summary");
    expect(migration).not.toMatch(/partner_price|purchase_price|warehouse|external_1c|margin/i);
  });

  it("keeps the RPC read-only, explicitly scoped, and public-callable", () => {
    expect(migration).toContain("stable");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("grant execute on function public.list_public_retail_related_products(text,text,integer)");
    expect(migration).not.toMatch(/insert into public\.public_retail_products|update public\.public_retail_products|delete from public\.public_retail_products/i);
  });
});

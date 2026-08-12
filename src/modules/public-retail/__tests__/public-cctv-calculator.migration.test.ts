import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260812213000_public_retail_cctv_calculator_resolver.sql"), "utf8");

describe("public retail CCTV resolver migration", () => {
  it("resolves a bounded profile batch only from the current published projection", () => {
    expect(sql).toContain("cardinality(p_profile_keys) > 30");
    expect(sql).toContain("public.public_retail_products");
    expect(sql).toContain("publication.status = 'published'");
    expect(sql).toContain("calculator_profile_keys");
    expect(sql).not.toContain("catalog_product_prices");
    expect(sql).not.toContain("partner_companies");
  });

  it("exposes only the anonymous read RPC and protects all other roles", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("from public, authenticated");
    expect(sql).toContain("to anon, service_role");
  });

  it("returns no product for an ambiguous governed profile", () => {
    expect(sql).toContain("case when match_count = 1 then product else null end");
  });
});

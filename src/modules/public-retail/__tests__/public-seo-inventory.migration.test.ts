import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20260816115423_public_retail_seo_inventory.sql",
), "utf8");

describe("public retail SEO inventory migration", () => {
  it("exposes one bounded public-safe projection read", () => {
    expect(migration).toContain("list_public_retail_sitemap_inventory()");
    expect(migration).toContain("limit 5001");
    expect(migration).toContain("publication.status = 'published'");
    expect(migration).toContain("PROJECT EQUIPMENT");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("security definer");
    expect(migration).toContain("grant execute on function public.list_public_retail_sitemap_inventory() to anon, authenticated, service_role");
    expect(migration).not.toMatch(/retail_price|external_1c|warehouse|partner_price|procurement|margin/i);
  });
});

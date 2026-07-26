import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260726120000_retail_only_commercial_redaction.sql",
  ),
  "utf8",
);

describe("retail-only commercial database boundary", () => {
  it("denies partner users direct raw price-table reads", () => {
    expect(sql).toContain('drop policy if exists "Approved users can select permitted active product prices"');
    expect(sql).toContain('create policy "Internal sync users can select product prices"');
    expect(sql).toContain("using (public.can_sync_catalog_read_model())");
    expect(sql).not.toMatch(
      /create policy "Internal sync users can select product prices"[\s\S]*?using\s*\(\s*true\s*\)/,
    );
  });

  it("projects only the explicitly permitted price type", () => {
    expect(sql).toContain("'pricing.partner_price.view'");
    expect(sql).toContain("'pricing.retail_price.view'");
    expect(sql).toContain("requested_price_type = company_price_type");
    expect(sql).toContain(
      "requested_price_type = 'd9c92519-658b-11e8-80d3-000c29a58b59'",
    );
    expect(sql).toContain("Commercial price projection access denied.");
    expect(sql).not.toContain("'prices.view'");
  });

  it("separates partner and retail conversion-rate visibility", () => {
    expect(sql).toContain("purpose = 'partner_price_usd_to_mdl'");
    expect(sql).toContain("purpose = 'retail_price_usd_to_mdl'");
    expect(sql).toMatch(
      /purpose = 'partner_price_usd_to_mdl'[\s\S]*?'pricing\.partner_price\.view'/,
    );
    expect(sql).toMatch(
      /purpose = 'retail_price_usd_to_mdl'[\s\S]*?'pricing\.retail_price\.view'/,
    );
  });

  it("removes the old aggregate entry point and confidential sort inference", () => {
    expect(sql).toMatch(
      /revoke all on function public\.catalog_partner_page\([\s\S]*?\) from public, anon, authenticated;/,
    );
    expect(sql).toContain(
      "p_sort in ('price_asc', 'price_desc', 'markup_asc', 'markup_desc')",
    );
    expect(sql).toContain("then 'default'");
  });

  it("keeps the bounded catalog projection authenticated and company scoped", () => {
    expect(sql).toContain("public.has_active_company_membership(p_company_id)");
    expect(sql).toContain("public.has_permission(p_company_id, 'catalog.view')");
    expect(sql).toContain(
      "grant execute on function public.catalog_partner_page_v2(",
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.catalog_partner_page_v2\([\s\S]*?\) to anon/,
    );
  });
});

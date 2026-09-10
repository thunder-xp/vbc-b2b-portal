import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260910214700_commerce_popular_hot_quality_threshold_calibration.sql",
  ),
  "utf8",
);

describe("Popular and HOT quality threshold calibration", () => {
  it("defines one stable score threshold per algorithm", () => {
    expect(sql).toContain("select 3::bigint");
    expect(sql).toContain("select 16.67::numeric");
    expect(sql).toContain("private.commerce_popular_min_frequency()");
    expect(sql).toContain("private.commerce_hot_min_margin_percent()");
    expect(sql).not.toMatch(/percentile_cont|percent_rank|ntile/i);
  });

  it("keeps full Popular evidence while thresholding canonical membership", () => {
    expect(sql).toContain("refresh_b2b_product_demand_ranking");
    expect(sql).toContain(
      "ranking.purchase_frequency >= private.commerce_popular_min_frequency()",
    );
    expect(sql).toContain(
      "'ranking.popularity_rank <= 40',\n    'ranking.purchase_frequency >= private.commerce_popular_min_frequency()'",
    );
    expect(sql).not.toMatch(/limit\s+(166|167|168|179)/i);
    expect(sql).not.toMatch(/quantity\s*(>=|>|desc)/i);
  });

  it("uses the same Popular threshold in B2B, B2C, Dashboard, catalog, and facets", () => {
    for (const functionName of [
      "get_published_product_merchandising_v6",
      "list_public_retail_products_v6",
      "get_public_retail_showcase_v6",
      "get_or_refresh_partner_dashboard_selections_v5",
      "catalog_partner_page_unified_period_base",
      "catalog_partner_page_automated_hot_base",
      "catalog_partner_facets_v7",
      "with_current_public_popularity",
    ]) {
      expect(sql).toContain(`'${functionName}'`);
    }
  });

  it("qualifies HOT before ranking without changing its ordering formula", () => {
    expect(sql).toContain(
      "eligible.hot_margin_percent >= private.commerce_hot_min_margin_percent()",
    );
    expect(sql).toContain("from eligible");
    expect(sql).not.toMatch(/hot_rank\s*<=\s*\d+/);
    expect(sql).not.toMatch(/limit\s+(141|165|166)/i);
    expect(sql).not.toMatch(/percentile_cont|percent_rank|ntile/i);
  });

  it("reuses the existing refresh lifecycle with no new fanout or scheduler", () => {
    expect(sql).toContain("select public.refresh_b2b_product_demand_ranking()");
    expect(sql).not.toMatch(/cron\.schedule|pg_cron|http_|net\.http/i);
    expect(sql).not.toContain("catalog_product_new_facts");
    expect(sql).not.toContain("partner_repeat_purchase");
    expect(sql).not.toContain("SPECIAL_OFFER");
    expect(sql).not.toContain("ARRIVAL");
  });

  it("keeps threshold helpers private and unavailable to browser roles", () => {
    expect(sql).toMatch(
      /revoke all on function private\.commerce_popular_min_frequency\(\),[\s\S]*private\.commerce_hot_min_margin_percent\(\)[\s\S]*from public, anon, authenticated, service_role/,
    );
  });
});

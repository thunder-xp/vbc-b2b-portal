import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(),
  "supabase/migrations/20260910163146_commerce_unified_hidden_365_data_driven_selections.sql"), "utf8");
const refreshRepairSql = readFileSync(join(process.cwd(),
  "supabase/migrations/20260910163625_commerce_unified_hidden_365_refresh_result_repair.sql"), "utf8");

describe("unified hidden-365 selection migration", () => {
  it("keeps one inclusive periodized frequency projection with the governed rank", () => {
    expect(sql).toContain("check (period_days in (30, 60, 90, 365))");
    expect(sql).toContain("Europe/Chisinau");
    expect(sql).toContain("purchase_frequency > 0");
    expect(sql).toContain("changed := replace(changed, 'and ranking.popularity_rank <= 40', '')");
    expect(sql).toContain("or changed like '%top40ThresholdFrequency%'");
    expect(sql).toContain("where ranking.period_days = p_popular_period_days\n      and ranking.purchase_frequency > 0");
    expect(sql).toContain("AUTOMATION_FIRST");
    expect(refreshRepairSql).toContain("where period_days = 365;");
    expect(refreshRepairSql).toContain("or changed like '%popularity_rank <= 40%'");
  });

  it("uses one bounded reader per surface and keeps full counts separate", () => {
    expect(sql).toContain("get_or_refresh_partner_dashboard_selections_v4");
    expect(sql).toContain("get_published_product_merchandising_v6");
    expect(sql).toContain("list_public_retail_products_v6");
    expect(sql).toContain("get_public_retail_showcase_v6");
    expect(sql).toContain("count(*) over ()::integer total_count");
    expect(sql).toContain("limit 5");
  });

  it("retains shared Repeat, Popular and NEW sources without live integration work", () => {
    expect(sql).toContain("get_partner_previously_purchased_products_v5");
    expect(sql).toContain("partner_order_history");
    expect(sql).toContain("b2b_product_demand_ranking");
    expect(sql).toContain("catalog_product_new_facts");
    expect(sql).not.toContain("http_");
    expect(sql).not.toContain("cron.schedule");
  });
});

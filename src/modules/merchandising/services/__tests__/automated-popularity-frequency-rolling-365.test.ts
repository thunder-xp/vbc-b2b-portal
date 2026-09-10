import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(join(
  root,
  "supabase/migrations/20260909181812_automated_popularity_frequency_rolling_365.sql",
), "utf8");
const compatibilityMigration = readFileSync(join(
  root,
  "supabase/migrations/20260909182500_public_popularity_contract_v3.sql",
), "utf8");
const publicRepository = readFileSync(join(
  root,
  "src/modules/public-retail/repositories/supabase/public-retail.supabase-repository.ts",
), "utf8");
const catalogRepository = readFileSync(join(
  root,
  "src/modules/catalog/repositories/supabase/catalog.supabase-repository.ts",
), "utf8");
const dashboardRepository = readFileSync(join(
  root,
  "src/modules/partner-cabinet/repositories/supabase-workspace-dashboard.repository.ts",
), "utf8");
const dailyRefresh = readFileSync(join(
  root,
  "app/api/cron/order-history-refresh/route.ts",
), "utf8");
const cronConfiguration = readFileSync(join(root, "vercel.json"), "utf8");

describe("rolling-365 purchase-frequency Popular contract", () => {
  it("counts one occurrence per authoritative order and excludes quantity from rank", () => {
    expect(migration).toContain("count(distinct governed.authoritative_order_id) as purchase_frequency");
    expect(migration).toMatch(/order by\s+aggregate\.purchase_frequency desc,\s+aggregate\.purchasing_company_count desc,\s+aggregate\.last_purchased_at desc,\s+product\.sku,\s+aggregate\.product_id/);
    const rankOrder = migration.match(/row_number\(\) over \(\s+order by\s+aggregate\.purchase_frequency[\s\S]*?\)\:\:integer as popularity_rank/)?.[0] ?? "";
    expect(rankOrder).not.toContain("total_purchased_quantity");
    expect(rankOrder).not.toContain("quantity desc");
  });

  it("uses an inclusive 365-calendar-day Europe/Chisinau window", () => {
    expect(migration).toContain("statement_timestamp() at time zone 'Europe/Chisinau'");
    expect(migration).toContain("governed_window_start := governed_business_date - 364");
    expect(migration).toContain("governed_window_end + 1");
    expect(migration).toContain("history.one_c_document_date >= governed_window_start_at");
    expect(migration).toContain("history.one_c_document_date < governed_window_end_exclusive_at");
    expect(new Date(Date.UTC(2026, 8, 9) - 364 * 86_400_000).toISOString().slice(0, 10)).toBe("2025-09-10");
    expect(new Date(Date.UTC(2024, 2, 1) - 364 * 86_400_000).toISOString().slice(0, 10)).toBe("2023-03-03");
  });

  it("publishes exactly the current Top 40 while keeping all eligible ranks", () => {
    expect(migration).toContain("ranking.popularity_rank <= 40");
    expect(migration).toContain("delete from public.b2b_product_demand_ranking ranking");
    expect(migration).toContain("top_40_threshold_frequency");
    expect(migration).toContain("select public.refresh_b2b_product_demand_ranking()");
  });

  it("reuses the daily order-history lifecycle even when no import is required", () => {
    expect(dailyRefresh).toContain("refreshB2bPopularity()");
    expect(cronConfiguration).toContain('"path": "/api/cron/order-history-refresh"');
    expect(cronConfiguration).toContain('"schedule": "30 4 * * *"');
  });

  it("makes current rank the shared B2B/B2C membership truth without public metrics", () => {
    expect(migration).toContain("join public.b2b_product_demand_ranking ranking");
    expect(migration).toContain("identity.source_product_id");
    expect(migration).toContain("public.build_public_retail_product_summary");
    expect(migration).toContain("'isPopular', ranking.product_id is not null");
    expect(migration).not.toContain("'purchaseFrequency'");
    expect(migration).not.toContain("'distinctCompanyCount'");
    expect(publicRepository).toContain('"get_public_retail_showcase_v6"');
    expect(publicRepository).toContain('"list_public_retail_products_v6"');
    expect(publicRepository).toContain('"list_public_retail_hot_products_v2"');
    expect(catalogRepository).toContain('"catalog_partner_page_v11"');
    expect(publicRepository).not.toContain("b2b_product_demand_ranking");
    expect(catalogRepository).not.toContain("partner_order_history");
    expect(dashboardRepository).not.toContain("partner_order_history");
    expect(migration).toContain("public.with_current_public_popularity");
  });

  it("keeps v2 wire responses backward-compatible while v3 carries isPopular", () => {
    expect(compatibilityMigration).toContain("rename to list_public_retail_products_current_v2");
    expect(compatibilityMigration).toContain("source.item - 'isPopular'");
    expect(compatibilityMigration).toContain("create function public.list_public_retail_products_v3");
    expect(compatibilityMigration).toContain("create function public.list_public_retail_hot_products_v2");
    expect(compatibilityMigration).toContain("public.list_public_retail_products_v3(");
    expect(compatibilityMigration).toContain("public.list_public_retail_hot_products_v2(");
    expect(compatibilityMigration).toMatch(/revoke all on function public\.list_public_retail_products_current_v2[\s\S]*service_role/);
  });

  it("rotates only bounded previews and keeps full Popular listings ranked", () => {
    expect(migration).toContain("pg_catalog.md5(p_rotation_seed || ':' || (pool.item ->> 'id'))");
    expect(migration).toContain("pg_catalog.md5(p_rotation_seed || ':' || assignment.product_id::text)");
    expect(migration).toMatch(/catalog_partner_page_v8[\s\S]*candidate\.popularity_rank/);
    expect(migration).toMatch(/list_public_retail_products_v2[\s\S]*current\.popularity_rank/);
  });

  it("keeps raw aggregates private and manual Popular disabled", () => {
    expect(migration).toMatch(/revoke all on function[\s\S]*public\.get_public_retail_showcase_v3/);
    expect(migration).toContain("to anon, authenticated");
    expect(migration).toContain("Superseded by automated rolling-365 purchase-frequency ranking");
    expect(migration).toContain("set is_active = false");
    expect(migration).toContain("assignment.source = 'manual'");
  });
});

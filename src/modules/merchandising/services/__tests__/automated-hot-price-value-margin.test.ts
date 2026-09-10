import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = read("supabase/migrations/20260910193509_automated_hot_price_value_margin.sql");
const activation = read("supabase/migrations/20260910195130_activate_automated_hot_system_management.sql");
const admin = read("src/modules/merchandising/components/MerchandisingAdminTable.tsx");
const service = read("src/modules/merchandising/services/merchandising.service.ts");
const dashboard = read("src/modules/partner-cabinet/components/OperationalDashboard.tsx");
const partnerCatalog = read("src/modules/catalog/components/CatalogMerchandisingSections.tsx");
const publicCatalog = read("src/modules/public-retail/components/PublicRetailShowcase.tsx");
const priceSync = read("src/modules/integration/sync/chunked-price-sync.ts");

describe("automated HOT price-value margin contract", () => {
  it("uses current DDP-to-STOP reserve with STOP as denominator", () => {
    expect(migration).toContain("((price.stop_price - price.ddp_price) / price.stop_price) * 100");
    expect(margin(60, 100)).toBe(40);
    expect(margin(90, 100)).toBe(10);
    expect(margin(60, 100)).toBeGreaterThan(margin(90, 100));
  });

  it("does not let absolute money difference override percentage reserve", () => {
    const expensive = { difference: 100, margin: margin(900, 1000) };
    const inexpensive = { difference: 50, margin: margin(50, 100) };
    expect(expensive.difference).toBeGreaterThan(inexpensive.difference);
    expect(expensive.margin).toBeLessThan(inexpensive.margin);
    expect(migration).toMatch(/hot_margin_percent desc,[\s\S]*purchase_frequency desc,[\s\S]*purchasing_company_count desc,[\s\S]*latest_purchase desc/);
  });

  it("keeps all eligible period members and excludes invalid comparisons", () => {
    expect(migration).toContain("ranking.period_days in (30, 60, 90, 365)");
    expect(migration).toContain("ranking.purchase_frequency > 0");
    expect(migration).toContain("stop.price_amount > ddp.price_amount");
    expect(migration).toContain("lower(stop.currency) = lower(ddp.currency)");
    expect(migration).not.toMatch(/hot_rank\s*<=\s*(20|40|50)/);
    expect(migration).not.toMatch(/quantity desc/);
  });

  it("keeps private prices and ranking metrics out of browser DTOs", () => {
    expect(migration).toContain("create table private.automated_hot_product_ranking");
    expect(migration).toMatch(/revoke all on private\.automated_hot_product_ranking from public, anon, authenticated, service_role/);
    expect(migration).toContain("'labelCodes','[\"HOT\"]'::jsonb");
    expect(migration).not.toContain("'hotMarginPercent'");
    expect(migration).not.toContain("'ddpPrice'");
  });

  it("uses hidden 365 plus independent 30/60/90 selectors everywhere", () => {
    expect(dashboard).toContain('hot: "hotPeriod"');
    expect(dashboard).toContain('periodKey="hot"');
    expect(partnerCatalog).toContain('curatedPeriodHref(periods, "hot", target)');
    expect(publicCatalog).toContain('showcasePeriodHref(locale, periods, mode, target)');
    expect(publicCatalog).toContain('query.set("hotPeriod", String(hot))');
  });

  it("bounds previews inside a high-value band and keeps full lists ranked", () => {
    expect(migration).toContain("candidate.hot_rank <= p_limit_per_label*3");
    expect(migration).toContain("order by hot_rank limit 15");
    expect(migration).toMatch(/list_public_retail_hot_products_v3[\s\S]*order by hot_rank,\(product_row\)\.sku/);
    expect(migration).toMatch(/p_merchandising_label = 'HOT' and effective_sort = 'default'[\s\S]*hot\.hot_rank/);
  });

  it("retires manual HOT only after refresh and preserves editorial concepts", () => {
    expect(activation.indexOf("select private.refresh_automated_hot_product_ranking()"))
      .toBeLessThan(activation.indexOf("update public.product_merchandising_assignments"));
    expect(activation).toContain("MERCHANDISING_HOT_SYSTEM_MANAGED");
    expect(service).toContain("MERCHANDISING_HOT_SYSTEM_MANAGED");
    expect(admin).not.toContain('<option value="HOT">');
    expect(admin).toContain('<option value="SPECIAL_OFFER">');
    expect(migration).toContain("get_or_refresh_partner_dashboard_selections_v5");
  });

  it("refreshes on existing price and order-history lifecycle without a scheduler", () => {
    expect(priceSync).toContain('client.rpc("refresh_automated_hot_product_ranking")');
    expect(migration).toContain("perform private.refresh_automated_hot_product_ranking()");
    expect(migration).not.toMatch(/cron\.schedule|pg_cron/i);
  });
});

function margin(ddp: number, stop: number): number {
  return ((stop - ddp) / stop) * 100;
}

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

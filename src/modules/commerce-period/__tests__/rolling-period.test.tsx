import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RollingPeriodSelector } from "../RollingPeriodSelector";
import { parseRollingPeriod } from "../rolling-period";
import { repeatPurchaseHref } from "../../orders/components/repeat-purchase-query";
import { buildCatalogHref } from "../../catalog/services/catalog-sort-state";

const migration = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20260909204308_partner_commerce_rolling_period_slices.sql",
), "utf8");

describe("rolling commerce periods", () => {
  it("defaults invalid input to 30 and accepts only 30/60/90", () => {
    expect(parseRollingPeriod(undefined)).toBe(30);
    expect(parseRollingPeriod("60")).toBe(60);
    expect(parseRollingPeriod(90)).toBe(90);
    expect(parseRollingPeriod("365")).toBe(30);
  });

  it("renders one underlined active period with stable navigation", () => {
    render(<RollingPeriodSelector
      activePeriod={60}
      hrefForPeriod={(period) => `/cabinet?period=${period}`}
      locale="ru"
    />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "60" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "60" })).toHaveClass("border-emerald-700");
    expect(screen.getByRole("link", { name: "30" })).toHaveClass("border-transparent");
    expect(screen.getByRole("link", { name: "90" })).toHaveAttribute("href", "/cabinet?period=90");
  });

  it("preserves period with Repeat Purchase filters and pagination", () => {
    expect(repeatPurchaseHref({
      categoryIds: ["22222222-2222-4222-8222-222222222222"],
      page: 3,
      period: 90,
      search: "camera",
    })).toBe("/cabinet/repeat-purchase?period=90&categories=22222222-2222-4222-8222-222222222222&search=camera&page=3");
  });

  it("preserves the selected period across Popular catalog state only", () => {
    expect(buildCatalogHref({
      availability: "in_stock",
      merchandisingLabel: "TOP",
      page: 2,
      period: 90,
      search: "camera",
    })).toBe("/cabinet/catalog?search=camera&label=TOP&period=90&availability=in_stock&page=2");
    expect(buildCatalogHref({
      merchandisingLabel: "NEW",
      period: 90,
    })).toBe("/cabinet/catalog?label=NEW");
  });

  it("defines inclusive business-date windows and independent frequency rankings", () => {
    expect(migration).toContain("at time zone 'Europe/Chisinau'");
    expect(migration).toContain("governed_business_date - (ranked.period_days - 1)");
    expect(migration).toContain("partition by aggregate.period_days");
    expect(migration).toContain("count(distinct governed.authoritative_order_id) as purchase_frequency");
    expect(migration).toMatch(/order by aggregate\.purchase_frequency desc,[\s\S]*aggregate\.purchasing_company_count desc,[\s\S]*aggregate\.last_purchased_at desc,[\s\S]*product\.sku,[\s\S]*aggregate\.product_id/);
    expect(migration).not.toMatch(/order by[\s\S]{0,120}(sum\(|total_purchased_quantity)/i);
  });

  it("keeps one refresh and one private ranking truth for all periods", () => {
    expect(migration).toContain("values (30::smallint), (60::smallint), (90::smallint)");
    expect(migration).toContain("primary key (period_days, product_id)");
    expect(migration).toContain("get_published_product_merchandising_v4");
    expect(migration).toContain("list_public_retail_products_v4");
    expect(migration).toContain("get_public_retail_showcase_v4");
    expect(migration).not.toContain("create extension");
    expect(migration).not.toContain("cron.schedule");
  });

  it("pins deployed legacy Popular readers to the default slice for safe rollout", () => {
    expect(migration).toContain("'catalog_partner_page_v8'");
    expect(migration).toContain("'list_public_retail_products_current_v2'");
    expect(migration).toContain("'with_current_public_popularity'");
    expect(migration).toContain("ranking.period_days = 30");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { discoveryProductVisibilityClass, hiddenDashboardProductCount } from "../OperationalDashboard";

describe("dashboard commerce and history UX", () => {
  it("computes hidden eligible cards and suppresses a zero badge", () => {
    expect(hiddenDashboardProductCount(29, 5)).toBe(24);
    expect(hiddenDashboardProductCount(5, 5)).toBe(0);
    expect(hiddenDashboardProductCount(3, 5)).toBe(0);
  });

  it("keeps the repeat-purchase route on the shared catalog card/table contract", () => {
    const page = readFileSync(resolve(process.cwd(), "app/(partner)/cabinet/repeat-purchase/page.tsx"), "utf8");
    expect(page).toContain("<CatalogPresentation");
    expect(page).toContain("parseCatalogViewMode");
    expect(page).toContain("<PartnerTopCategoryFilterBar");
    expect(page).toContain("<NumberedPagination");
    expect(page).toContain("detailReturnHref={currentHref}");
    expect(page).not.toContain("companyId={single(params");
  });

  it("keeps one compact discovery teaser and routes it to the storefront", () => {
    const dashboard = readFileSync(resolve(process.cwd(), "src/modules/partner-cabinet/components/OperationalDashboard.tsx"), "utf8");
    expect(dashboard).toContain('actionHref="/cabinet/catalog" actionLabel={partnerText(locale, "dashboard.openShowcase")}');
    expect(dashboard).toContain('data-dashboard-section="discovery"');
    expect(dashboard).not.toContain('analyticsSurface="dashboard_popular"');
    expect(dashboard).not.toContain('analyticsSurface="dashboard_new"');
    expect(dashboard).not.toContain('analyticsSurface="dashboard_hot"');
    expect(dashboard).toContain("bg-emerald-700");
    expect(dashboard).toContain("text-white");
    expect(dashboard).not.toContain("CampaignCard");
  });

  it("keeps the mixed teaser bounded at responsive preview capacities", () => {
    expect(Array.from({ length: 6 }, (_, index) => discoveryProductVisibilityClass(index))).toEqual([
      "min-w-0",
      "hidden min-w-0 sm:block",
      "hidden min-w-0 lg:block",
      "hidden min-w-0 xl:block",
      "hidden min-w-0 2xl:block",
      "hidden min-w-0 2xl:block",
    ]);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { hiddenDashboardProductCount } from "../OperationalDashboard";

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
    expect(page).toContain("<RepeatPurchaseCategoryFilters");
    expect(readFileSync(resolve(process.cwd(), "src/modules/orders/components/RepeatPurchaseCategoryFilters.tsx"), "utf8")).toContain("data-repeat-purchase-categories");
    expect(page).toContain("<NumberedPagination");
    expect(page).toContain("detailReturnHref={currentHref}");
    expect(page).not.toContain("companyId={single(params");
  });

  it("uses green compact count badges and routes all offers to the storefront", () => {
    const dashboard = readFileSync(resolve(process.cwd(), "src/modules/partner-cabinet/components/OperationalDashboard.tsx"), "utf8");
    expect(dashboard).toContain('actionHref="/cabinet/catalog" actionLabel={partnerText(locale, "dashboard.allOffers")}');
    expect(dashboard).toContain("bg-emerald-700");
    expect(dashboard).toContain("text-white");
    expect(dashboard).not.toContain('actionHref="/cabinet/offers" actionLabel={partnerText(locale, "dashboard.allOffers")}');
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(path), "utf8");

describe("Partner tabs and segmented-control visual standard", () => {
  it("defines canonical desktop and touch geometry", () => {
    const styles = read("src/modules/partner-cabinet/components/PartnerSelectionStandard.module.css");

    expect(styles).toContain("[data-partner-segment]");
    expect(styles).toContain("height: 32px");
    expect(styles).toContain("height: 36px");
    expect(styles).toContain("font-size: 11px");
    expect(styles).toContain("font-weight: 500");
    expect(styles).toContain("font-weight: 600");
  });

  it("uses existing accessible selected-state attributes and visible focus", () => {
    const styles = read("src/modules/partner-cabinet/components/PartnerSelectionStandard.module.css");
    const tabs = read("src/modules/partner-cabinet/components/PartnerWorkspaceTabs.tsx");
    const finance = read("src/modules/partner-cabinet/components/FinancePeriodPanel.tsx");
    const sales = read("src/modules/partner-cabinet/components/SalesTrendSummary.tsx");

    expect(styles).toContain("[aria-current=\"page\"]");
    expect(styles).toContain("[aria-pressed=\"true\"]");
    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("#dashboard-sales-period-30:checked");
    expect(styles).toContain("[data-sales-period-label=\"30\"]");
    expect(tabs).toContain("aria-current={active ? \"page\" : undefined}");
    expect(finance).toContain("aria-pressed={selectedDays === days}");
    expect(sales).toContain('type="radio"');
  });

  it("preserves URL-backed navigation and period values", () => {
    const orders = read("app/(partner)/cabinet/orders/page.tsx");
    const estimates = read("app/(partner)/cabinet/estimates/page.tsx");
    const finance = read("src/modules/partner-cabinet/components/FinancePeriodPanel.tsx");

    expect(orders).toContain("href={filterHref(value, result.data.search)}");
    expect(estimates).toContain("href={filter.href}");
    expect(finance).toContain("const PERIODS: DashboardAnalyticsPeriod[] = [30, 60, 90, 180]");
  });
});

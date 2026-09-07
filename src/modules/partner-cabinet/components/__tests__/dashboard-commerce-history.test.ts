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
    expect(page).toContain("data-repeat-purchase-categories");
    expect(page).toContain("<NumberedPagination");
    expect(page).toContain("detailReturnHref={currentHref}");
    expect(page).not.toContain("companyId={single(params");
  });
});

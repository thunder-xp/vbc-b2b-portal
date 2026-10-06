import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(path), "utf8");

describe("Partner table visual standard", () => {
  it("scopes compact table typography and controls to the Partner shell", () => {
    const layout = read("src/modules/partner-cabinet/components/PartnerLayout.tsx");
    const styles = read("src/modules/partner-cabinet/components/PartnerTableStandard.module.css");

    expect(layout).toContain("PartnerTableStandard.module.css");
    expect(layout).toContain("styles.tableStandard");
    expect(styles).toContain("font-size: 10px; font-weight: 600");
    expect(styles).toContain("height: 36px; padding: 6px 10px; font-size: 11px");
    expect(styles).toContain("font-variant-numeric: tabular-nums");
    expect(styles).toContain("min-width: 36px; min-height: 36px");
  });

  it("marks commercial, SKU, status, metadata, and action cells semantically", () => {
    const estimates = read("app/(partner)/cabinet/estimates/page.tsx");
    const reservations = read("src/modules/reservation-requests/components/ReservationDetail.tsx");
    const specifications = read("src/modules/project-specifications/components/SpecificationDetail.tsx");

    expect(estimates).toContain("data-table-total");
    expect(estimates).toContain("data-table-status");
    expect(estimates).toContain("data-table-actions");
    expect(reservations).toContain("data-table-sku");
    expect(reservations).toContain("data-table-numeric");
    expect(specifications).toContain("data-table-sku");
    expect(specifications).toContain("data-table-total");
  });
});

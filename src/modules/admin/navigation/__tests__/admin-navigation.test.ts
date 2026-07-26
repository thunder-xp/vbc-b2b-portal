import { describe, expect, it } from "vitest";

import {
  buildAdminNavigation,
  findAdminNavigationItem,
} from "../admin-navigation";

describe("admin navigation", () => {
  it("filters children and removes empty groups", () => {
    const navigation = buildAdminNavigation([
      "admin.dashboard.view",
      "admin.finance.view",
    ]);

    expect(navigation).toHaveLength(1);
    expect(navigation[0]?.items.map((item) => item.href)).toEqual(["/admin"]);
  });

  it("gives sales only currently implemented authorized modules", () => {
    const navigation = buildAdminNavigation([
      "admin.dashboard.view",
      "admin.users.view",
      "admin.access_requests.view",
      "admin.orders.view",
      "admin.shipments.view",
      "admin.estimates.view",
      "order_date_changes.review",
      "specifications.review",
    ]);
    const hrefs = navigation.flatMap((group) =>
      group.items.map((item) => item.href),
    );

    expect(hrefs).toContain("/admin/company-users");
    expect(hrefs).toContain("/admin/partner-requests");
    expect(hrefs).toContain("/admin/specifications");
    expect(hrefs).not.toContain("/admin/commercial-rates");
    expect(hrefs).not.toContain("/admin/integrations/1c-health");
  });

  it("resolves the most specific active route for breadcrumbs", () => {
    const navigation = buildAdminNavigation([
      "admin.dashboard.view",
      "admin.access_requests.view",
    ]);

    expect(
      findAdminNavigationItem(
        navigation,
        "/admin/partner-requests/request-1",
      )?.label,
    ).toBe("Заявки на доступ");
  });
});

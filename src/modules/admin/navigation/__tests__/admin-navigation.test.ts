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

  it.each([
    {
      role: "finance",
      permissions: ["admin.dashboard.view", "admin.finance.view"],
      present: ["/admin"],
      absent: ["/admin/company-users", "/admin/integrations/catalog-sync"],
    },
    {
      role: "support",
      permissions: [
        "admin.dashboard.view",
        "admin.users.view",
        "admin.access_requests.view",
        "admin.integrations.view",
      ],
      present: [
        "/admin",
        "/admin/company-users",
        "/admin/partner-requests",
        "/admin/integrations/1c-health",
      ],
      absent: ["/admin/commercial-rates", "/admin/specifications"],
    },
    {
      role: "content manager",
      permissions: [
        "admin.dashboard.view",
        "admin.catalog.view",
        "admin.integrations.view",
      ],
      present: [
        "/admin",
        "/admin/integrations/catalog-sync",
        "/admin/integrations/1c-health",
      ],
      absent: ["/admin/company-users", "/admin/commercial-rates"],
    },
    {
      role: "partner",
      permissions: [],
      present: [],
      absent: ["/admin", "/admin/company-users"],
    },
  ])(
    "shows only implemented authorized modules for $role",
    ({ permissions, present, absent }) => {
      const hrefs = buildAdminNavigation(permissions).flatMap((group) =>
        group.items.map((item) => item.href),
      );

      for (const href of present) expect(hrefs).toContain(href);
      for (const href of absent) expect(hrefs).not.toContain(href);
    },
  );

  it("allows a platform administrator to see every implemented admin route", () => {
    const navigation = buildAdminNavigation([
      "admin.dashboard.view",
      "admin.users.view",
      "admin.access_requests.view",
      "admin.catalog.view",
      "admin.rates.view",
      "admin.integrations.view",
      "order_date_changes.review",
      "specifications.review",
    ]);

    expect(navigation.flatMap((group) => group.items)).toHaveLength(8);
  });
});

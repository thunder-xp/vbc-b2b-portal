import { describe, expect, it } from "vitest";

import {
  ADMIN_NAVIGATION,
  buildAdminNavigation,
  findAdminNavigationItem,
} from "../admin-navigation";

const allPermissions = [
  "admin.dashboard.view",
  "admin.platform_health.view",
  "admin.companies.view",
  "admin.users.view",
  "admin.invitations.view",
  "admin.access_requests.view",
  "admin.security.view",
  "admin.catalog.view",
  "admin.prices.view",
  "admin.stock.view",
  "admin.rates.view",
  "admin.integrations.view",
  "admin.orders.view",
  "admin.shipments.view",
  "order_date_changes.review",
  "reservations.review",
  "specifications.review",
  "admin.estimates.view",
  "admin.finance.view",
  "admin.audit.view",
  "admin.settings.view",
];

describe("admin navigation", () => {
  it("filters children and removes empty groups", () => {
    const navigation = buildAdminNavigation(["admin.finance.view"]);
    expect(navigation).toHaveLength(1);
    expect(navigation[0]?.items.map((item) => item.href)).toEqual([
      "/admin/finance",
    ]);
  });

  it("gives platform administrators every canonical module", () => {
    const items = buildAdminNavigation(allPermissions).flatMap(
      (group) => group.items,
    );
    expect(items).toHaveLength(
      ADMIN_NAVIGATION.flatMap((group) => group.items).length,
    );
  });

  it.each([
    {
      role: "sales",
      permissions: [
        "admin.dashboard.view",
        "admin.companies.view",
        "admin.users.view",
        "admin.invitations.view",
        "admin.access_requests.view",
        "admin.orders.view",
        "admin.shipments.view",
        "admin.estimates.view",
        "order_date_changes.review",
        "reservations.review",
        "specifications.review",
      ],
      present: ["/admin/orders", "/admin/specifications", "/admin/estimates"],
      absent: ["/admin/finance", "/admin/settings"],
    },
    {
      role: "finance",
      permissions: [
        "admin.dashboard.view",
        "admin.platform_health.view",
        "admin.companies.view",
        "admin.finance.view",
      ],
      present: ["/admin", "/admin/platform-health", "/admin/finance"],
      absent: ["/admin/users", "/admin/integrations"],
    },
    {
      role: "support",
      permissions: [
        "admin.dashboard.view",
        "admin.platform_health.view",
        "admin.users.view",
        "admin.integrations.view",
        "admin.security.view",
      ],
      present: ["/admin/integrations", "/admin/integrations/1c-health", "/admin/access"],
      absent: ["/admin/commercial/prices", "/admin/finance"],
    },
    {
      role: "content manager",
      permissions: [
        "admin.dashboard.view",
        "admin.platform_health.view",
        "admin.catalog.view",
        "admin.integrations.view",
      ],
      present: ["/admin/commercial/catalog", "/admin/integrations"],
      absent: ["/admin/users", "/admin/commercial/prices"],
    },
    {
      role: "partner",
      permissions: [],
      present: [],
      absent: ["/admin", "/admin/users"],
    },
  ])("shows only approved modules for $role", ({ permissions, present, absent }) => {
    const hrefs = buildAdminNavigation(permissions).flatMap((group) =>
      group.items.map((item) => item.href),
    );
    for (const href of present) expect(hrefs).toContain(href);
    for (const href of absent) expect(hrefs).not.toContain(href);
  });

  it("resolves the most specific active route", () => {
    const navigation = buildAdminNavigation(allPermissions);
    expect(
      findAdminNavigationItem(navigation, "/admin/integrations/jobs")?.label,
    ).toBe("История заданий");
  });

  it("contains no duplicate destinations", () => {
    const links = ADMIN_NAVIGATION.flatMap((group) =>
      group.items.map((item) => item.href),
    );
    expect(new Set(links).size).toBe(links.length);
  });

  it("does not expose compatibility routes", () => {
    const links = ADMIN_NAVIGATION.flatMap((group) =>
      group.items.map((item) => item.href),
    );
    expect(links).not.toContain("/admin/company-users");
    expect(links).not.toContain("/admin/commercial-rates");
    expect(links).not.toContain("/admin/integrations/catalog-sync");
    expect(links).not.toContain("/admin/reservation-requests");
    expect(links).not.toContain("/admin/access-requests");
  });
});

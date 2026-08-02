import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AdminCompanyAccess } from "../../types";
import { AdminCompanyPlatformAccess } from "../AdminCompanyPlatformAccess";

vi.mock("../../actions", () => ({
  updateAdminCompanyAccessAction: vi.fn(),
}));

const access: AdminCompanyAccess = {
  companyId: "00000000-0000-0000-0000-000000000001",
  presetCode: "full_partner_access",
  version: 1,
  changedAt: "2026-08-02T10:00:00Z",
  changedBy: "Administrator",
  changeNote: null,
  canManage: true,
  presets: [
    { code: "full_partner_access", name: "Full access", permissionCodes: ["catalog.view", "finance.view_company"] },
    { code: "orders_only", name: "Orders only", permissionCodes: ["catalog.view"] },
    { code: "catalog_only", name: "Catalog only", permissionCodes: ["catalog.view"] },
    { code: "custom", name: "Custom", permissionCodes: [] },
  ],
  capabilities: [
    { code: "catalog.view", description: "Catalog", category: "catalog", enabled: true },
    { code: "finance.view_company", description: "Finance", category: "finance", enabled: true },
  ],
  recentEvents: [],
};

describe("AdminCompanyPlatformAccess", () => {
  it("renders manual presets, capability preview, and no user-management toggle", () => {
    render(<AdminCompanyPlatformAccess access={access} />);

    expect(screen.getByRole("heading", { name: "Platform access" })).toBeInTheDocument();
    expect(screen.getByLabelText("Полный доступ")).toBeChecked();
    expect(screen.getByLabelText(/catalog\.view/)).toBeChecked();
    expect(screen.getByLabelText(/finance\.view_company/)).toBeChecked();
    expect(screen.queryByText("company_users.manage")).not.toBeInTheDocument();
    expect(screen.getByText(/не зависят от статуса партнёра или вида цены/)).toBeInTheDocument();
  });
});

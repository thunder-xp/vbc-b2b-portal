import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CompanyUsersPanel } from "../CompanyUsersPanel";

vi.mock("../../../actions/company-users.actions", () => ({
  appointCompanyOwnerAction: vi.fn(),
  createEmployeeInvitationAction: vi.fn(),
  reissueEmployeeInvitationAction: vi.fn(),
  restoreCompanyEmployeeAction: vi.fn(),
  revokeEmployeeInvitationAction: vi.fn(),
  suspendCompanyEmployeeAction: vi.fn(),
  updateCompanyEmployeeAccessAction: vi.fn(),
}));

describe("CompanyUsersPanel", () => {
  it("renders business labels without exposing raw identifiers or permissions", () => {
    render(
      <CompanyUsersPanel
        companyId="company-secret"
        companyName="ALERT-SS"
        events={[]}
        isAdmin={false}
        page={{
          records: [{
            recordType: "membership",
            recordId: "membership-secret",
            userId: "user-secret",
            fullName: "Анна Иванова",
            email: "anna@example.com",
            roleCode: "partner_viewer",
            roleName: "Просмотр",
            membershipStatus: "active",
            invitationStatus: null,
            priceAccess: "retail_only",
            joinedAt: "2026-07-26T00:00:00Z",
            createdAt: "2026-07-26T00:00:00Z",
          }],
          page: 1,
          pageSize: 25,
          totalCount: 1,
          totalPages: 1,
        }}
      />,
    );
    expect(screen.getByText("Сотрудники и доступ")).toBeInTheDocument();
    expect(screen.getAllByText("Только розничные")).not.toHaveLength(0);
    expect(screen.getByText("Активен")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("company_users.manage");
    expect(document.body.textContent).not.toContain("membership-secret");
  });
});

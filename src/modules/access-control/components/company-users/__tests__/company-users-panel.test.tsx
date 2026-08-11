import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CompanyUsersPanel } from "../CompanyUsersPanel";

vi.mock("../../../actions/company-users.actions", () => ({
  appointCompanyOwnerAction: vi.fn(),
  createEmployeeInvitationAction: vi.fn(),
  reissueEmployeeInvitationAction: vi.fn(),
  restoreCompanyEmployeeAction: vi.fn(),
  revokeEmployeeInvitationAction: vi.fn(),
  revokeCompanyEmployeeAccessAction: vi.fn(),
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
    expect(screen.getByRole("button", { name: "Пригласить сотрудника" })).toBeInTheDocument();
    expect(screen.getByText("Сотрудники")).toBeInTheDocument();
    expect(screen.getByText("Ожидают принятия")).toBeInTheDocument();
    expect(screen.getAllByText("Только розничные цены")).not.toHaveLength(0);
    expect(screen.getByText("Активен")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("company_users.manage");
    expect(document.body.textContent).not.toContain("membership-secret");
  });

  it("separates pending invitations and retains revoked access as history", () => {
    render(<CompanyUsersPanel companyId="company" companyName="ALERT-SS" events={[]} isAdmin={false} page={{
      records: [
        { recordType: "invitation", recordId: "invite", userId: null, fullName: "Новый сотрудник", email: "new@example.com", roleCode: "partner_buyer", roleName: "Покупатель", membershipStatus: null, invitationStatus: "pending", priceAccess: "full", joinedAt: null, createdAt: "2026-08-11T00:00:00Z" },
        { recordType: "membership", recordId: "old", userId: "user-old", fullName: "Бывший сотрудник", email: "old@example.com", roleCode: "partner_viewer", roleName: "Наблюдатель", membershipStatus: "revoked", invitationStatus: null, priceAccess: "retail_only", joinedAt: "2026-07-01T00:00:00Z", createdAt: "2026-07-01T00:00:00Z" },
      ], page: 1, pageSize: 25, totalCount: 2, totalPages: 1,
    }} />);
    expect(screen.getByText("Ожидают принятия")).toBeInTheDocument();
    expect(screen.getByText("История доступа")).toBeInTheDocument();
    expect(screen.getByText("Отозвано")).toBeInTheDocument();
  });

  it("shows the bounded audit inspector only to the admin surface", () => {
    render(
      <CompanyUsersPanel
        companyId="company"
        companyName="ALERT-SS"
        events={[{
          id: "event",
          targetUserId: null,
          targetInvitationId: "invitation",
          actorUserId: "admin",
          eventType: "employee_suspended",
          safePayload: {},
          createdAt: "2026-07-26T10:00:00Z",
        }]}
        isAdmin
        page={{
          records: [],
          page: 1,
          pageSize: 25,
          totalCount: 0,
          totalPages: 1,
        }}
      />,
    );
    expect(screen.getByText("Журнал доступа")).toBeInTheDocument();
    expect(screen.getByText("Доступ сотрудника приостановлен")).toBeInTheDocument();
  });
});

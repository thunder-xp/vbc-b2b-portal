import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInvitationPreview: vi.fn(),
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/src/modules/access-control/actions/service-factory", () => ({
  createCompanyUserManagementService: () => ({ getInvitationPreview: mocks.getInvitationPreview }),
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));
vi.mock("@/src/modules/access-control/actions/company-users.actions", () => ({
  acceptCompanyInvitationAction: vi.fn(),
}));

import InvitationAcceptancePage from "../[token]/page";

describe("company invitation page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockRejectedValue(new Error("unauthenticated"));
    mocks.getInvitationPreview.mockResolvedValue({
      companyName: "NADZOR SRL",
      invitedEmail: "employee@example.com",
      invitedFullName: "Employee",
      roleCode: "partner_buyer",
      expiresAt: "2026-08-18T00:00:00Z",
      status: "pending",
      accountExists: false,
    });
  });

  it("shows trusted company and role with invitation-specific account creation", async () => {
    render(await InvitationAcceptancePage({ params: Promise.resolve({ token: "abcdefghijklmnopqrstuvwxyz123456" }), searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Вас пригласили в NADZOR SRL" })).toBeInTheDocument();
    expect(screen.getByText("Покупатель")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Создать аккаунт" })).toHaveAttribute("href", expect.stringContaining("/register"));
    expect(document.body.textContent).not.toMatch(/Devino partener|Заявка на доступ|Страна|IDNO/i);
  });

  it("routes an existing account through login and acceptance", async () => {
    mocks.getInvitationPreview.mockResolvedValue({ ...(await mocks.getInvitationPreview()), accountExists: true });
    render(await InvitationAcceptancePage({ params: Promise.resolve({ token: "abcdefghijklmnopqrstuvwxyz123456" }), searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("link", { name: "Войти и принять приглашение" })).toHaveAttribute("href", expect.stringContaining("/auth/sign-in?next="));
  });

  it("returns a safe unavailable state for expired or revoked tokens", async () => {
    mocks.getInvitationPreview.mockResolvedValue(null);
    render(await InvitationAcceptancePage({ params: Promise.resolve({ token: "abcdefghijklmnopqrstuvwxyz123456" }), searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Приглашение недоступно" })).toBeInTheDocument();
  });
});

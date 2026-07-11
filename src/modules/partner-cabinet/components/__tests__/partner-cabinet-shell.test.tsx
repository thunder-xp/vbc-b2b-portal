import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PartnerHeader } from "../PartnerHeader";
import { PartnerSidebar } from "../PartnerSidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/cabinet" }));
vi.mock("@/src/modules/auth/actions/auth.actions", () => ({ signOutAction: vi.fn() }));

const context = {
  userDisplayName: "Partner User",
  userEmail: "partner@example.com",
  companyName: "Partner Company",
  membershipRole: "Владелец компании",
  accessState: "active" as const,
};

describe("Partner workspace shell", () => {
  it("renders business identity without raw role IDs", () => {
    render(<PartnerHeader context={context} />);

    expect(screen.getByText("Partner User")).toBeInTheDocument();
    expect(screen.getByText("Partner Company")).toBeInTheDocument();
    expect(screen.getByText("Владелец компании")).toBeInTheDocument();
    expect(screen.queryByText("role-1")).not.toBeInTheDocument();
  });

  it("shows workspace navigation and controlled future states", () => {
    render(<PartnerSidebar hasWorkspaceAccess />);

    expect(screen.getByRole("link", { name: "Рабочее пространство" })).toHaveAttribute("href", "/cabinet");
    expect(screen.getByRole("link", { name: "Каталог" })).toHaveAttribute("href", "/cabinet/catalog");
    expect(screen.getByText("Заказы")).toBeInTheDocument();
    expect(screen.getByText("Финансы")).toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("does not link commercial modules when workspace access is blocked", () => {
    render(<PartnerSidebar hasWorkspaceAccess={false} />);

    expect(screen.getByRole("link", { name: "Рабочее пространство" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Каталог" })).not.toBeInTheDocument();
  });
});

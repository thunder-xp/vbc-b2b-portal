import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PartnerHeader } from "../PartnerHeader";
import { PartnerSidebar } from "../PartnerSidebar";
import { resolveWorkspaceCapabilities } from "../../services";

vi.mock("next/navigation", () => ({ usePathname: () => "/cabinet" }));
vi.mock("@/src/modules/auth/actions/auth.actions", () => ({ signOutAction: vi.fn() }));

const context = {
  userDisplayName: "Partner User",
  userEmail: "partner@example.com",
  companyName: "Partner Company",
  membershipRole: "Владелец компании",
  accessState: "active" as const,
  navigation: resolveWorkspaceCapabilities(new Set(["catalog.view", "orders.create", "specifications.manage", "documents.view_company"])).navigation,
};

const navigation = context.navigation;

describe("Partner workspace shell", () => {
  it("renders business identity without raw role IDs", () => {
    render(<PartnerHeader context={context} />);

    expect(screen.getByText("Partner User")).toBeInTheDocument();
    expect(screen.getByText("Partner Company")).toBeInTheDocument();
    expect(screen.getByText("Владелец компании")).toBeInTheDocument();
    expect(screen.queryByText("role-1")).not.toBeInTheDocument();
  });

  it("shows workspace navigation and controlled future states", () => {
    render(<PartnerSidebar hasWorkspaceAccess navigation={navigation} />);

    expect(screen.getByRole("link", { name: "Рабочий стол" })).toHaveAttribute("href", "/cabinet");
    expect(screen.getByRole("link", { name: "Каталог" })).toHaveAttribute("href", "/cabinet/catalog");
    expect(screen.getByText("Подбор решения")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Спецификации" })).toHaveAttribute("href", "/cabinet/specifications");
    expect(screen.getByText("Сметы и КП")).toBeInTheDocument();
    expect(screen.getByText("Заказы")).toBeInTheDocument();
    expect(screen.getByText("Документы")).toBeInTheDocument();
    expect(screen.getByText("Сервис и гарантия")).toBeInTheDocument();
    expect(screen.getByText("База знаний")).toBeInTheDocument();
    expect(screen.queryByText("Точные остатки")).not.toBeInTheDocument();
    expect(screen.queryByText("Персональные цены")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("does not link commercial modules when workspace access is blocked", () => {
    render(<PartnerSidebar hasWorkspaceAccess={false} navigation={navigation} />);

    expect(screen.getByText("Рабочий стол")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Рабочий стол" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Каталог" })).not.toBeInTheDocument();
  });
});

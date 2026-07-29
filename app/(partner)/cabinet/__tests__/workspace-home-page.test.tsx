import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceHomeAction: vi.fn(),
  redirect: vi.fn((href: string) => { throw new Error(`NEXT_REDIRECT:${href}`); }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/src/modules/partner-cabinet/actions/workspace-home.action", () => ({ getWorkspaceHomeAction: mocks.getWorkspaceHomeAction }));
vi.mock("server-only", () => ({}));

import CabinetPage from "../page";

describe("Partner Workspace home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceHomeAction.mockResolvedValue({ success: true, errorCode: null, message: "Workspace loaded.", data: workspaceData() });
  });

  it("renders installer-focused quick actions and operational cards", async () => {
    render(await CabinetPage());

    expect(screen.getByText("Novotech Partner Workspace")).toBeInTheDocument();
    expect(screen.getByText("Добро пожаловать, Partner User")).toBeInTheDocument();
    expect(screen.getByText("Partner Company")).toBeInTheDocument();
    expect(screen.getByText("Partner Owner")).toBeInTheDocument();
    expect(screen.getByText("Статус партнёра")).toBeInTheDocument();
    expect(screen.getByText("GOLD")).toBeInTheDocument();
    expect(screen.queryByText("Вид цены")).not.toBeInTheDocument();
    expect(screen.getByText("Весь каталог")).toBeInTheDocument();
    expect(screen.getAllByText("Мои заказы")).toHaveLength(2);
    expect(screen.getByText("Планируемые отгрузки")).toBeInTheDocument();
    expect(screen.getByText("Доступ компании")).toBeInTheDocument();
  });

  it("renders honest empty states without invented counts or technical modules", async () => {
    const { container } = render(await CabinetPage());

    expect(screen.getByText(/Проверьте активные заказы/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Точные остатки|Персональные цены|Price group|1C integration/);
    expect(container.textContent).not.toMatch(/f7df2069|33333333/);
    expect(container.textContent).not.toMatch(/\b[1-9]\d*\s+(заказ|проект)/i);
  });

  it("shows the safe commercial configuration warning", async () => {
    mocks.getWorkspaceHomeAction.mockResolvedValue({ success: true, errorCode: null, message: "Workspace loaded.", data: { ...workspaceData(), commercialConfigurationMissing: true } });
    render(await CabinetPage());
    expect(screen.getByText("Коммерческие условия компании ещё не настроены. Обратитесь к менеджеру Novotech.")).toBeInTheDocument();
  });

  it("redirects unauthenticated users", async () => {
    mocks.getWorkspaceHomeAction.mockResolvedValue({ success: false, errorCode: "AUTH_REQUIRED", message: "Authentication is required.", data: null });
    await expect(CabinetPage()).rejects.toThrow("NEXT_REDIRECT:/auth/sign-in");
  });
});

function workspaceData() {
  return {
    greetingName: "Partner User",
    company: { name: "Partner Company", role: "Partner Owner", external1cCode: "UU-001940", priceType: "GOLD", accountManager: null },
    quickActions: [
      { key: "catalog", label: "Весь каталог", href: "/cabinet/catalog", availability: "available" },
      { key: "orders", label: "Мои заказы", href: "/cabinet/orders", availability: "available" },
      { key: "shipments", label: "Планируемые отгрузки", href: "/cabinet/reservation-requests", availability: "available" },
    ],
    processCards: [
      { key: "orders", title: "Заказы", status: "normal", summary: "Проверьте активные заказы, даты отгрузки и позиции, требующие уточнения.", actionLabel: "Мои заказы", href: "/cabinet/orders" },
      { key: "company_users", title: "Доступ компании", status: "normal", summary: "Проверьте сотрудников, роли и ожидающие приглашения.", actionLabel: "Управление сотрудниками", href: "/cabinet/company/users" },
    ],
    commercialConfigurationMissing: false,
  };
}

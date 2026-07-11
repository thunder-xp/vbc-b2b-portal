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
    expect(screen.getByText("GOLD")).toBeInTheDocument();
    expect(screen.getByText("Создать проект")).toBeInTheDocument();
    expect(screen.getByText("Подобрать оборудование")).toBeInTheDocument();
    expect(screen.getByText("Мои проекты")).toBeInTheDocument();
    expect(screen.getByText("Требует внимания")).toBeInTheDocument();
  });

  it("renders honest empty states without invented counts or technical modules", async () => {
    const { container } = render(await CabinetPage());

    expect(screen.getByText("Проекты пока не созданы.")).toBeInTheDocument();
    expect(screen.getByText("Заказов пока нет.")).toBeInTheDocument();
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
      { key: "create_project", label: "Создать проект", href: null, availability: "coming_soon" },
      { key: "select_equipment", label: "Подобрать оборудование", href: "/cabinet/catalog", availability: "available" },
      { key: "create_specification", label: "Создать спецификацию", href: null, availability: "coming_soon" },
      { key: "create_proposal", label: "Сформировать КП", href: null, availability: "coming_soon" },
      { key: "repeat_order", label: "Повторить заказ", href: null, availability: "coming_soon" },
      { key: "register_warranty", label: "Зарегистрировать гарантийный случай", href: null, availability: "coming_soon" },
    ],
    processCards: [
      { key: "projects", title: "Мои проекты", emptyMessage: "Проекты пока не созданы.", actionLabel: "Создать первый проект" },
      { key: "orders", title: "Заказы", emptyMessage: "Заказов пока нет.", actionLabel: "Перейти к каталогу" },
      { key: "attention", title: "Требует внимания", emptyMessage: "Нет задач, требующих вашего внимания.", actionLabel: "Всё в порядке" },
    ],
    commercialConfigurationMissing: false,
  };
}

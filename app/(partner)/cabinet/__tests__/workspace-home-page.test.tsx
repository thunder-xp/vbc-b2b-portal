import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceHomeAction: vi.fn(),
  redirect: vi.fn((href: string) => { throw new Error(`NEXT_REDIRECT:${href}`); }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/src/modules/partner-cabinet/actions", () => ({ getWorkspaceHomeAction: mocks.getWorkspaceHomeAction }));
vi.mock("@/src/modules/auth/actions/auth.actions", () => ({ signOutAction: vi.fn() }));
vi.mock("server-only", () => ({}));

import CabinetPage from "../page";

describe("Partner Workspace home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceHomeAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Workspace loaded.",
      data: workspaceData(),
    });
  });

  it("renders the personalized production workspace", async () => {
    render(await CabinetPage());

    expect(screen.getByText("Novotech Partner Workspace")).toBeInTheDocument();
    expect(screen.getByText("Добро пожаловать, Partner User")).toBeInTheDocument();
    expect(screen.getAllByText("Partner Company").length).toBeGreaterThan(0);
    expect(screen.getByText("Владелец компании")).toBeInTheDocument();
    expect(screen.getAllByText("GOLD").length).toBeGreaterThan(0);
    expect(screen.getByText("Рабочие модули")).toBeInTheDocument();
    expect(screen.getAllByText("Проверить остатки").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Посмотреть свои цены").length).toBeGreaterThan(0);
    expect(screen.getByText("Создать заказ поставщику")).toBeInTheDocument();
    expect(screen.getByText("Подобрать проектное оборудование")).toBeInTheDocument();
  });

  it("does not expose raw 1C GUIDs and controls unavailable modules", async () => {
    render(await CabinetPage());

    expect(screen.queryByText("33333333-3333-4333-8333-333333333333")).not.toBeInTheDocument();
    expect(screen.queryByText("f7df2069-884d-11ea-97e0-000c29cf9dd4")).not.toBeInTheDocument();
    expect(screen.queryByText("Финансы")).not.toBeInTheDocument();
    expect(screen.queryByText("Документы")).not.toBeInTheDocument();
    expect(screen.queryByText("Сервис и гарантия")).not.toBeInTheDocument();
    expect(screen.queryByText("Поддержка")).not.toBeInTheDocument();
    expect(screen.getAllByText("Скоро").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Создать заказ поставщику" })).not.toBeInTheDocument();
  });

  it("shows an actionable state when price type is missing", async () => {
    mocks.getWorkspaceHomeAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Workspace loaded.",
      data: { ...workspaceData(), commercialConfigurationMissing: true },
    });

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
    company: { name: "Partner Company", status: "active", role: "Владелец компании", external1cCode: "000152", priceType: "GOLD", accessStatus: "Активен" },
    catalog: { totalProductsLabel: "24", brands: 5, categories: 8 },
    pricing: { isActive: true, priceType: "GOLD", lastUpdate: "Данные доступны" },
    inventory: { isSynchronized: true, lastSynchronization: "10 июл. 2026 г." },
    operational: { activeOrders: 0, openProjects: 0, documentsRequiringAttention: 0, supportRequests: 0 },
    activity: [],
    modules: [
      { key: "inventory", title: "Проверить остатки", description: "Остатки.", href: "/cabinet/catalog", availability: "available" },
      { key: "pricing", title: "Посмотреть свои цены", description: "Цены.", href: "/cabinet/catalog", availability: "available" },
      { key: "supplier_orders", title: "Создать заказ поставщику", description: "Закупочный процесс.", href: null, availability: "coming_soon" },
      { key: "project_equipment", title: "Подобрать проектное оборудование", description: "Проектный подбор.", href: null, availability: "coming_soon" },
      { key: "company", title: "Моя компания", description: "Компания.", href: "/cabinet/company", availability: "available" },
    ],
    commercialConfigurationMissing: false,
  };
}

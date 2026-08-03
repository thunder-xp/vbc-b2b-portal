import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceHomeAction: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/src/modules/partner-cabinet/actions/workspace-home.action", () => ({
  getWorkspaceHomeAction: mocks.getWorkspaceHomeAction,
}));
vi.mock("@/src/modules/behavior-analytics/components/BehaviorViewEvent", () => ({
  BehaviorViewEvent: () => null,
  recordBehaviorInteraction: vi.fn(),
}));
vi.mock("@/src/modules/service-center/actions", () => ({
  getPartnerServiceDashboardAction: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));
vi.mock("server-only", () => ({}));

import CabinetPage from "../page";

describe("Partner Workspace operational home", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceHomeAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Workspace loaded.",
      data: workspaceData(),
    });
  });

  it("renders the operational hierarchy and honest empty states", async () => {
    render(await CabinetPage());

    expect(screen.queryByRole("heading", { name: /Partner/ })).not.toBeInTheDocument();
    expect(screen.getByText("Требует внимания")).toBeInTheDocument();
    expect(screen.getByText("Всё в порядке. Срочных действий нет.")).toBeInTheDocument();
    expect(screen.getByText("Заказы")).toBeInTheDocument();
    expect(screen.getByText("Ближайшие отгрузки")).toBeInTheDocument();
    expect(screen.getByText("У компании пока нет заказов.")).toBeInTheDocument();
    expect(screen.getByText("Ближайшие отгрузки не запланированы.")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })[0]).toHaveTextContent("Требует внимания");
  });

  it("keeps quick actions out of the dashboard body and shows no invented metrics", async () => {
    const { container } = render(await CabinetPage());

    expect(screen.queryByText("Весь каталог")).not.toBeInTheDocument();
    expect(screen.queryByText("Мои заказы")).not.toBeInTheDocument();
    expect(screen.queryByText("Финансы")).not.toBeInTheDocument();
    expect(screen.queryByText("Моя компания")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/1C integration|f7df2069|33333333/);
  });

  it("renders canonical dismissible attention", async () => {
    mocks.getWorkspaceHomeAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Workspace loaded.",
      data: {
        ...workspaceData(),
        attentionItems: [{
          id: "order-1",
          kind: "shipment_overdue",
          title: "Отгрузка заказа NSUU-1 просрочена",
          consequence: "Откройте заказ и уточните дату.",
          href: "/cabinet/orders/order-1",
          occurredAt: "2026-07-30T08:00:00Z",
          sourceFingerprint: "a".repeat(64),
          dismissPolicy: "until_source_change",
          severity: "warning",
          orderNumber: "NSUU-1",
          plannedDate: "2026-07-30",
          isTest: false,
          ctaLabel: "Открыть заказ",
        }],
      },
    });

    render(await CabinetPage());
    expect(screen.getByText("Отгрузка заказа NSUU-1 просрочена")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Скрыть сообщение" })).toBeInTheDocument();
  });

  it("redirects unauthenticated users", async () => {
    mocks.getWorkspaceHomeAction.mockResolvedValue({
      success: false,
      errorCode: "AUTH_REQUIRED",
      message: "Authentication is required.",
      data: null,
    });
    await expect(CabinetPage()).rejects.toThrow("NEXT_REDIRECT:/auth/sign-in");
  });
});

function workspaceData() {
  return {
    identity: { firstName: "Partner", greeting: "Доброе утро" },
    company: { name: "Partner Company", role: "Partner Owner", priceType: "GOLD" },
    capabilities: {
      navigation: [
        { key: "catalog", label: "Каталог", href: "/cabinet/catalog", icon: "catalog", availability: "available" },
        { key: "orders", label: "Заказы", href: "/cabinet/orders", icon: "orders", availability: "available" },
      ],
      productCard: {
        showPrice: true,
        showPartnerPrice: true,
        showRetailPrice: true,
        showStock: true,
        showExactQuantity: true,
        showWarehouseAvailability: true,
        showExpectedArrival: true,
        showProjectPriceEligibility: false,
        showTechnicalDocuments: false,
        showCompatibility: true,
        canAddToSpecification: false,
        canAddToOrder: true,
        canAddToProject: false,
      },
      canCreateCommercialProposal: false,
      canUseWarranty: false,
      canViewKnowledgeBase: false,
      canManageCompanyUsers: false,
    },
    attentionItems: [],
    orderSummary: { active: 0, confirmed: 0, attention: 0, portalProcessing: 0, recent: [] },
    shipmentSummary: { overdue: 0, today: 0, nextThreeDays: 0, later: 0, items: [] },
    quickActions: [
      { key: "catalog", label: "Весь каталог", href: "/cabinet/catalog" },
      { key: "orders", label: "Мои заказы", href: "/cabinet/orders" },
    ],
    continuationItems: [],
    reorderProducts: [],
    merchandisingProducts: [],
    opportunities: [],
    campaigns: [],
    recentDocuments: [],
    financeSummary: null,
    companySummary: null,
    commercialConfigurationMissing: false,
    purchasingDynamics: null,
    commercialFreshness: [],
  };
}

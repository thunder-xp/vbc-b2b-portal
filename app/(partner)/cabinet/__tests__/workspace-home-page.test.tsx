import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceHomeAction: vi.fn(),
  getPartnerLocale: vi.fn().mockResolvedValue("ru"),
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/src/modules/partner-cabinet/actions/workspace-home.action", () => ({
  getWorkspaceHomeAction: mocks.getWorkspaceHomeAction,
}));
vi.mock("@/src/modules/partner-locale/server", () => ({
  getPartnerLocale: mocks.getPartnerLocale,
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
    mocks.getPartnerLocale.mockResolvedValue("ru");
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

  it("keeps the authoritative commercial section order", () => {
    const source = readFileSync(join(process.cwd(), "src/modules/partner-cabinet/components/OperationalDashboard.tsx"), "utf8");
    const dashboard = source.slice(
      source.indexOf("export function OperationalDashboard"),
      source.indexOf("export function EstimateSalesSection"),
    );
    const markers = [
      "<ProductSection",
      'data-dashboard-section="priority-work"',
      "<OpportunitySection",
      "<FinanceSection",
      'data-dashboard-section="fulfilment"',
      "<NovotechOffersSection",
    ];
    const positions = markers.map((marker) => dashboard.indexOf(marker));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it("keeps quick actions out of the dashboard body and shows no invented metrics", async () => {
    const { container } = render(await CabinetPage());

    expect(screen.queryByText("Весь каталог")).not.toBeInTheDocument();
    expect(screen.queryByText("Мои заказы")).not.toBeInTheDocument();
    expect(screen.queryByText("Финансы")).not.toBeInTheDocument();
    expect(screen.queryByText("Моя компания")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/1C integration|f7df2069|33333333/);
  });

  it.each([
    ["ru", "Платёжный календарь", "Просрочено", "Сегодня", "В ближайшее время"],
    ["ro", "Calendarul plăților", "Restante", "Astăzi", "În perioada următoare"],
  ])("renders the local Finance payment graph in %s", async (locale, heading, overdue, today, upcoming) => {
    mocks.getPartnerLocale.mockResolvedValue(locale);
    mocks.getWorkspaceHomeAction.mockResolvedValue({
      success: true,
      data: {
        ...workspaceData(),
        financeGuidance: {
          state: "overdue",
          totals: [{ currency: "MDL", outstanding: 600, overdue: 100 }],
          nextDueDate: "2026-09-05",
          fresh: true,
          calendar: { startDate: "2026-04-11", endDate: "2026-10-08", today: "2026-09-08", todayPosition: 83.33 },
          paymentGraph: [
            { id: "overdue", eventDate: "2026-09-05", orderNumber: "NS-1", amount: 100, currency: "MDL", timing: "overdue", relativeHeight: 25, positionPercent: 67.9, stackIndex: 0, stackCount: 1 },
            { id: "today", eventDate: "2026-09-08", orderNumber: "NS-2", amount: 200, currency: "MDL", timing: "today", relativeHeight: 50, positionPercent: 68.68, stackIndex: 0, stackCount: 1 },
            { id: "upcoming", eventDate: "2026-09-20", orderNumber: "NS-3", amount: 400, currency: "MDL", timing: "upcoming", relativeHeight: 100, positionPercent: 72, stackIndex: 0, stackCount: 1 },
            { id: "paid", eventDate: "2026-08-20", orderNumber: "NS-4", amount: 300, currency: "MDL", timing: "paid", relativeHeight: 75, positionPercent: 63.7, stackIndex: 0, stackCount: 1 },
          ],
        },
      },
    });

    render(await CabinetPage());
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByText(overdue, { selector: "span" })).toBeInTheDocument();
    expect(screen.getAllByText(today, { selector: "span" })).toHaveLength(2);
    expect(screen.getByText(upcoming, { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: new RegExp(today) })).toHaveAttribute("data-payment-today-marker");
    expect(document.querySelector('[data-payment-state="paid"] span[aria-hidden="true"]')).toHaveClass("bg-zinc-400");
  });

  it("renders a truthful empty payment-graph state", async () => {
    mocks.getWorkspaceHomeAction.mockResolvedValue({
      success: true,
      data: {
        ...workspaceData(),
        financeGuidance: {
          state: "healthy",
          totals: [],
          nextDueDate: null,
          fresh: true,
          calendar: { startDate: "2026-03-12", endDate: "2026-09-08", today: "2026-09-08", todayPosition: 100 },
          paymentGraph: [],
        },
      },
    });
    render(await CabinetPage());
    expect(screen.getByText("В выбранном периоде платежей нет.")).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: /Сегодня/ })).toBeInTheDocument();
  });

  it("renders canonical attention without a dismiss control", async () => {
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
    expect(screen.queryByRole("button", { name: "Скрыть сообщение" })).not.toBeInTheDocument();
  });

  it("gives attention and sales columns the same heading and first-row baseline contract", async () => {
    mocks.getWorkspaceHomeAction.mockResolvedValue({ success: true, data: {
      ...workspaceData(),
      attentionItems: [{
        id: "order-1", kind: "shipment_overdue", title: "Attention", consequence: "Check order", href: "/cabinet/orders/order-1",
        occurredAt: "2026-09-08T08:00:00Z", sourceFingerprint: "a".repeat(64), dismissPolicy: "never", severity: "warning",
        orderNumber: "NS-1", plannedDate: "2026-09-08", isTest: false, ctaLabel: "Открыть заказ",
      }],
      estimateSalesOpportunities: [{
        id: "estimate-1", type: "awaiting_customer", customerName: "Customer", proposalName: "Proposal", estimateNumber: "KP-1",
        amount: 100, currency: "MDL", projectName: null, followUpState: "sent_not_opened", waitingSince: "2026-09-07",
        href: "/cabinet/estimates/estimate-1", action: "open",
      }],
    } });

    const { container } = render(await CabinetPage());
    const headings = container.querySelectorAll('[data-dashboard-priority-work] [data-dashboard-section-heading]');
    expect(headings).toHaveLength(2);
    expect([...headings].every((heading) => heading.classList.contains("min-h-11"))).toBe(true);
    expect(container.querySelectorAll('[data-dashboard-priority-work] ul.mt-2')).toHaveLength(2);
  });

  it("renders governed attention in Romanian without persisted mojibake", async () => {
    mocks.getPartnerLocale.mockResolvedValue("ro");
    mocks.getWorkspaceHomeAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Workspace loaded.",
      data: {
        ...workspaceData(),
        attentionItems: [{
          id: "arrival-1",
          kind: "notification_warehouse_arrival_completed",
          title: "Новое пополнение склада",
          consequence: "Поставка завершена.",
          href: "/cabinet/catalog/replenishment",
          occurredAt: "2026-08-21T08:00:00Z",
          sourceFingerprint: "a".repeat(32),
          dismissPolicy: "until_source_change",
          severity: "info",
          orderNumber: null,
          plannedDate: null,
          isTest: false,
          ctaLabel: "РџРѕСЃРјРѕС‚СЂРµС‚СЊ",
        }],
      },
    });

    render(await CabinetPage());
    const attention = screen.getByRole("heading", { name: "Necesită atenție" }).closest("section");
    expect(screen.getByText("Ultima aprovizionare a depozitului")).toBeInTheDocument();
    expect(screen.getByText("Vezi ultima aprovizionare")).toBeInTheDocument();
    expect(attention?.textContent).not.toMatch(/[\u0400-\u04ff]|�/u);
  });

  it.each(["ru", "ro"])("keeps %s test-return attention compact without duplicated state or timestamp", async (locale) => {
    mocks.getPartnerLocale.mockResolvedValue(locale);
    mocks.getWorkspaceHomeAction.mockResolvedValue({ success: true, data: { ...workspaceData(), attentionItems: [{
      id: "test-order", kind: "test_return_overdue", title: "Old title", consequence: "Old body", href: "/cabinet/orders/test-order",
      occurredAt: "2026-06-30T08:00:00Z", sourceFingerprint: "a".repeat(64), dismissPolicy: "until_source_change", severity: "warning",
      orderNumber: "TEST-1", plannedDate: "2026-06-30", isTest: true, ctaLabel: "Open",
    }] } });
    const { container } = render(await CabinetPage());
    const card = container.querySelector('[data-attention-card]');
    expect(card).toHaveClass("px-3", "py-2", "grid-cols-[20px_minmax(0,1fr)]", "sm:grid-cols-[20px_minmax(0,1fr)_auto]");
    expect(screen.getAllByText(locale === "ru" ? "Тестовый период завершён" : "Perioada de testare s-a încheiat")).toHaveLength(1);
    expect(screen.queryByText(locale === "ru" ? "Тестовый" : "Test", { exact: true })).toBeNull();
    expect(card?.querySelector('a')).toHaveClass("min-h-11");
    expect(card?.querySelector("form")).toBeNull();
    expect(card?.querySelector("button")).toBeNull();
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

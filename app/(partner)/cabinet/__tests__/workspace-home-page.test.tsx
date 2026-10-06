import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  BehaviorTrackedLink: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
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
    expect(screen.getByText("Нет задач")).toBeInTheDocument();
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
      source.indexOf("function DiscoverySection"),
    );
    const markers = [
      "<RepeatPurchaseSection",
      "<DiscoverySection",
      'data-dashboard-section="priority-work"',
      "<OpportunitySection",
      "<FinanceSection",
      "<SpecialOffersSection",
      'data-dashboard-section="fulfilment"',
    ];
    const positions = markers.map((marker) => dashboard.indexOf(marker));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it("renders exactly five compact overview cards, including honest empty states", async () => {
    const { container } = render(await CabinetPage());
    const overview = container.querySelector("[data-dashboard-overview]")!;
    const cards = [...overview.querySelectorAll("[data-dashboard-overview-card]")];
    expect(cards.map((card) => within(card as HTMLElement).getByRole("heading").textContent)).toEqual([
      "Требует внимания", "Возможности продаж", "Финансы", "Текущие заказы", "Ближайшая отгрузка",
    ]);
    expect(cards.every((card) => card.querySelectorAll("a").length === 1)).toBe(true);
    expect(cards[0].querySelector("[data-overview-primary]")).toHaveTextContent("0");
    expect(cards[0]).toHaveTextContent("Нет задач");
    expect(cards[0]).not.toHaveClass("bg-emerald-50");
    expect(cards[1]).toHaveTextContent("Нет возможностей");
    expect(cards[2]).toHaveTextContent("Нет данных");
    expect(cards[4]).toHaveTextContent("Не запланирована");
    const iconClasses = ["lucide-circle-alert", "lucide-calculator", "lucide-landmark", "lucide-list-checks", "lucide-truck"];
    expect(cards.map((card, index) => {
      const badge = card.querySelector("[data-overview-icon-badge]");
      const icon = card.querySelector("[data-overview-icon]");
      expect(badge).toHaveAttribute("aria-hidden", "true");
      expect(badge).toHaveClass("absolute", "right-3", "top-3", "size-10", "rounded-md", "bg-emerald-50", "text-emerald-800");
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(icon).toHaveClass("size-5", iconClasses[index]);
      return icon?.getAttribute("data-overview-icon");
    })).toEqual(["attention", "sales", "finance", "orders", "shipment"]);
    expect(overview.querySelectorAll("[data-overview-icon-badge]")).toHaveLength(5);
    expect(cards.map((card) => card.querySelector("a")?.getAttribute("href"))).toEqual([
      "/cabinet/orders",
      "/cabinet/estimates",
      "/cabinet/finance",
      "/cabinet/orders",
      "/cabinet/orders",
    ]);
    expect(cards.every((card) => card.querySelector("a")?.getAttribute("data-action-level") === "text-link")).toBe(true);
    expect(cards.every((card) => card.querySelector("a")?.classList.contains("text-xs"))).toBe(true);
    expect(overview.querySelector("ul")).toBeNull();
    expect(container.querySelector("[data-dashboard-operational-summary]")).toBeNull();
    expect(container.querySelectorAll("[data-attention-card]")).toHaveLength(0);
  });

  it("uses the first governed attention destination without changing task ordering or metadata", async () => {
    const attention = ["NS-2", "NS-1"].map((number, index) => ({
      id: number, kind: "shipment_overdue", title: `Отгрузка ${number}`, consequence: "Уточните дату", href: `/cabinet/orders/${number}`,
      occurredAt: "2026-09-01T00:00:00Z", sourceFingerprint: number, dismissPolicy: "until_source_change", severity: "warning", orderNumber: number,
      plannedDate: index ? "2026-09-03" : "2026-09-01", isTest: false, ctaLabel: "Открыть заказ",
    }));
    mocks.getWorkspaceHomeAction.mockResolvedValue({ success: true, data: { ...workspaceData(), attentionItems: attention } });
    const before = JSON.stringify(attention);
    const { container } = render(await CabinetPage());
    const card = container.querySelector('[data-dashboard-overview-card="attention"]')!;
    expect(card.querySelector("[data-overview-primary]")).toHaveTextContent("2");
    expect(card.querySelector("[data-overview-secondary]")).toHaveTextContent("NS-2");
    expect(card).not.toHaveTextContent("NS-1");
    expect(within(card as HTMLElement).getByRole("link")).toHaveAttribute("href", "/cabinet/orders/NS-2");
    expect(JSON.stringify(attention)).toBe(before);
  });

  it("keeps financial snapshots and chart while removing the dashboard-only payment detail list", async () => {
    const payment = { id: "planned-mdl", eventDate: "2026-09-08", orderNumber: "NS-1", amount: 100, currency: "MDL", timing: "upcoming", relativeHeight: 50, positionPercent: 50, stackIndex: 0, stackCount: 1 };
    const guidance = { ...financeGuidanceData(), paymentGraph: [payment, { ...payment, id: "paid-eur", currency: "EUR", amount: 75, timing: "paid" }] };
    const before = JSON.stringify(guidance);
    mocks.getWorkspaceHomeAction.mockResolvedValue({ success: true, data: { ...workspaceData(), financeGuidance: guidance } });
    const { container } = render(await CabinetPage());
    expect(screen.getByText("Остаток обязательств на дату обновления")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-payment-currency]")).toHaveLength(2);
    expect(container.querySelector('[data-payment-currency="MDL"] [data-payment-bar]')).toHaveAttribute("data-payment-state", "upcoming");
    expect(container.querySelector('[data-payment-currency="EUR"] [data-payment-bar]')).toHaveAttribute("data-payment-state", "paid");
    expect(container.querySelector("[data-dashboard-payment-list]")).toBeNull();
    expect(container.querySelectorAll("[data-dashboard-payment-row]")).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Полный календарь" })).toHaveAttribute("href", "/cabinet/finance#payment-calendar");
    const panel = container.querySelector("[data-finance-period-panel]");
    expect(panel?.lastElementChild).toHaveAttribute("data-payment-calendar");
    expect(JSON.stringify(guidance)).toBe(before);
  });

  it("shows one existing finance metric without adding currencies together", async () => {
    const guidance = { ...financeGuidanceData(), state: "overdue", totals: [
      { currency: "MDL", outstanding: 500, overdue: 100 },
      { currency: "EUR", outstanding: 300, overdue: 200 },
    ] };
    const before = JSON.stringify(guidance);
    mocks.getWorkspaceHomeAction.mockResolvedValue({ success: true, data: { ...workspaceData(), financeGuidance: guidance } });
    const { container } = render(await CabinetPage());
    const card = container.querySelector('[data-dashboard-overview-card="finance"]')!;
    expect(card.querySelector("[data-overview-primary]")).toHaveTextContent(/100,00\sMDL/);
    expect(card.querySelector("[data-overview-secondary]")).toHaveTextContent("Просрочено");
    expect(card.querySelector("a")).toHaveAttribute("href", "/cabinet/finance");
    expect(card).not.toHaveTextContent("EUR");
    expect(JSON.stringify(guidance)).toBe(before);
  });

  it.each([
    ["healthy", /500,00\sMDL/, "К оплате"],
    ["unavailable", /Нет актуальных данных/, null],
  ])("keeps the overview finance snapshot truthful for %s data", async (state, primary, secondary) => {
    mocks.getWorkspaceHomeAction.mockResolvedValue({ success: true, data: { ...workspaceData(), financeGuidance: {
      ...financeGuidanceData(), state, totals: [{ currency: "MDL", outstanding: 500, overdue: 100 }],
    } } });
    const { container } = render(await CabinetPage());
    const card = container.querySelector('[data-dashboard-overview-card="finance"]')!;
    expect(card.querySelector("[data-overview-primary]")).toHaveTextContent(primary as RegExp);
    if (secondary) expect(card.querySelector("[data-overview-secondary]")).toHaveTextContent(secondary as string);
    else expect(card.querySelector("[data-overview-secondary]")).toBeNull();
  });

  it("uses the current ready KP, active orders and governed first planned shipment unchanged", async () => {
    const data = { ...workspaceData(), orderSummary: { ...workspaceData().orderSummary, active: 25 },
      estimateSalesOpportunities: ["KP-2", "KP-1"].map((number) => ({
        id: number, type: "ready_to_send", customerName: "Customer", proposalName: "Proposal", estimateNumber: number,
        amount: 100, currency: "MDL", projectName: null, waitingSince: "2026-09-07", href: `/cabinet/estimates/${number}`, action: "open_and_send",
      })),
      shipmentSummary: { ...workspaceData().shipmentSummary, items: ["2026-10-08", "2026-10-07"].map((date, index) => ({
        id: `shipment-${index}`, orderNumber: `NS-${index}`, plannedDate: date, statusLabel: "Открыт", positionCount: 1, totalUnits: 5,
        pendingDateChange: false, href: `/cabinet/orders/shipment-${index}`, isTest: false,
      })) },
    };
    const before = JSON.stringify(data);
    mocks.getWorkspaceHomeAction.mockResolvedValue({ success: true, data });
    const { container } = render(await CabinetPage());
    const sales = container.querySelector('[data-dashboard-overview-card="sales"]')!;
    const orders = container.querySelector('[data-dashboard-overview-card="orders"]')!;
    const shipment = container.querySelector('[data-dashboard-overview-card="shipment"]')!;
    expect(sales).toHaveTextContent("КП готово к отправке");
    expect(sales.querySelector("[data-overview-secondary]")).toHaveTextContent("KP-2");
    expect(within(sales as HTMLElement).getByRole("link", { name: "Открыть и отправить" })).toHaveAttribute("href", "/cabinet/estimates/KP-2");
    expect(orders.querySelector("[data-overview-primary]")).toHaveTextContent("25");
    expect(orders.querySelector("a")).toHaveAttribute("href", "/cabinet/orders");
    expect(shipment.querySelector("[data-overview-primary]")).toHaveTextContent(/8 окт\. 2026 г\./);
    expect(shipment.querySelector("[data-overview-secondary]")).toHaveTextContent("Плановая дата · NS-0");
    expect(shipment.querySelector("a")).toHaveAttribute("href", "/cabinet/orders/shipment-0");
    expect(JSON.stringify(data)).toBe(before);
  });

  it("localizes all five overview titles and their empty states in Romanian", async () => {
    mocks.getPartnerLocale.mockResolvedValue("ro");
    const { container } = render(await CabinetPage());
    const overview = container.querySelector("[data-dashboard-overview]")!;
    expect(within(overview as HTMLElement).getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "Necesită atenție", "Oportunități de vânzare", "Finanțe", "Comenzi curente", "Următoarea livrare",
    ]);
    expect(overview).toHaveTextContent("Nicio sarcină");
    expect(overview).toHaveTextContent("Nicio oportunitate");
    expect(overview.textContent).not.toMatch(/[\u0400-\u04ff]|�/u);
  });

  it("does not invent a payment deadline or expose an unavailable order summary", async () => {
    const guidance = { ...financeGuidanceData(), nextDueDate: null };
    const data = workspaceData();
    mocks.getWorkspaceHomeAction.mockResolvedValue({ success: true, data: { ...data, capabilities: { ...data.capabilities, navigation: [] }, financeGuidance: guidance } });
    const { container } = render(await CabinetPage());
    expect(screen.getByText("Срок не указан")).toBeInTheDocument();
    const overview = container.querySelector("[data-dashboard-overview]")!;
    expect(overview.querySelectorAll("[data-dashboard-overview-card]")).toHaveLength(5);
    expect(overview.querySelector('[data-dashboard-overview-card="orders"]')).toHaveTextContent("Недоступно");
    expect(overview.querySelectorAll("a")).toHaveLength(0);
    expect([...overview.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);
  });

  it("renders governed special offers between analytics and fulfilment with the orange badge", async () => {
    mocks.getWorkspaceHomeAction.mockResolvedValue({ success: true, data: {
      ...workspaceData(),
      specialOfferProducts: [{ product: {
        id: "promo-1", sku: "PROMO-1", name: "Акционный товар", slug: "promo-1",
        shortDescription: null, imageUrl: null, brand: null, category: null,
        keyCharacteristics: [], datasheet: null, merchandisingLabels: ["SPECIAL_OFFER"],
      } }],
    } });

    const { container } = render(await CabinetPage());
    const offers = container.querySelector('[data-dashboard-section="special-offers"]');
    const fulfilment = container.querySelector('[data-dashboard-section="fulfilment"]');
    expect(screen.getByRole("heading", { name: "Спецпредложения" })).toBeInTheDocument();
    expect(screen.getByText("СПЕЦПРЕДЛОЖЕНИЕ")).toHaveClass("bg-orange-500", "text-white");
    expect(offers?.compareDocumentPosition(fulfilment!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("keeps quick actions out of the dashboard body and shows no invented metrics", async () => {
    const { container } = render(await CabinetPage());

    expect(screen.queryByText("Весь каталог")).not.toBeInTheDocument();
    expect(screen.queryByText("Мои заказы")).not.toBeInTheDocument();
    expect(container.querySelector('[data-dashboard-overview-card="finance"] [data-overview-primary]')).toHaveTextContent("Нет данных");
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
          calendar: {
            startDate: "2026-06-10",
            endDate: "2026-10-08",
            today: "2026-09-08",
            todayPosition: 75,
            amountScaleMaximum: 400,
            axisLabels: [
              { date: "2026-06-10", kind: "start", positionPercent: 0, track: 0, showOnMobile: true, align: "start" },
              { date: "2026-08-20", kind: "payment", positionPercent: 59.17, track: 0, showOnMobile: false, align: "center" },
              { date: "2026-09-08", kind: "today", positionPercent: 75, track: 1, showOnMobile: true, align: "center" },
              { date: "2026-10-08", kind: "end", positionPercent: 100, track: 0, showOnMobile: true, align: "end" },
            ],
          },
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
    expect(screen.getAllByText(overdue, { selector: "span" })[0]).toBeInTheDocument();
    expect(screen.getAllByText(today, { selector: "span" })).toHaveLength(2);
    expect(screen.getByText(upcoming, { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: new RegExp(today) })).toHaveAttribute("data-payment-today-marker");
    expect(document.querySelector('[data-payment-state="paid"] span[aria-hidden="true"]')).toHaveClass("bg-zinc-400");
    expect(document.querySelectorAll("[data-payment-axis-date]")).toHaveLength(4);
    expect(document.querySelector('[data-payment-axis-kind="today"]')).toHaveTextContent(locale === "ro" ? "08 sept" : "08 сент");
    expect(document.querySelector("[data-payment-scale-maximum]")).toHaveAttribute("data-payment-scale-maximum", "400");
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
          calendar: {
            startDate: "2026-05-11",
            endDate: "2026-09-08",
            today: "2026-09-08",
            todayPosition: 100,
            amountScaleMaximum: 0,
            axisLabels: [
              { date: "2026-05-11", kind: "start", positionPercent: 0, track: 0, showOnMobile: true, align: "start" },
              { date: "2026-09-08", kind: "today", positionPercent: 100, track: 0, showOnMobile: true, align: "end" },
            ],
          },
          paymentGraph: [],
        },
      },
    });
    render(await CabinetPage());
    expect(screen.getByText("В выбранном периоде платежей нет.")).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: /Сегодня/ })).toBeInTheDocument();
  });

  it.each([
    ["ru", "Финансы", "Закупки", "Открыть финансы", "Открыть заказы", "Динамика закупок"],
    ["ro", "Finanțe", "Achiziții", "Deschide finanțele", "Deschide comenzile", "Dinamica achizițiilor"],
  ])("renders aligned Finance bars and Sales lines with complete %s copy", async (locale, finance, sales, openFinance, openSales, dynamics) => {
    mocks.getPartnerLocale.mockResolvedValue(locale);
    mocks.getWorkspaceHomeAction.mockResolvedValue({
      success: true,
      data: {
        ...workspaceData(),
        financeGuidance: financeGuidanceData(),
        salesAnalytics: salesAnalyticsData(),
      },
    });

    const { container } = render(await CabinetPage());
    const split = container.querySelector("[data-dashboard-finance-sales]");
    expect(split).toHaveClass("grid", "items-stretch", "xl:grid-cols-2");
    const financePanel = split?.querySelector("[data-finance-panel]");
    const salesPanel = split?.querySelector("[data-sales-panel]");
    expect(financePanel).toHaveAttribute("data-analytics-card");
    expect(salesPanel).toHaveAttribute("data-analytics-card");
    expect(financePanel).toHaveClass("flex-1", "p-3");
    expect(salesPanel).toHaveClass("flex-1", "p-3");
    expect(within(split as HTMLElement).getByRole("heading", { name: finance })).toBeInTheDocument();
    expect(within(split as HTMLElement).getByRole("heading", { name: sales })).toBeInTheDocument();
    const financeAction = within(split as HTMLElement).getByRole("link", { name: new RegExp(openFinance) });
    const salesAction = within(split as HTMLElement).getByRole("link", { name: new RegExp(openSales) });
    expect(financeAction).toHaveAttribute("href", "/cabinet/finance");
    expect(salesAction).toHaveAttribute("href", "/cabinet/orders");
    expect(financeAction).toHaveAttribute("data-action-level", "text-link");
    expect(salesAction).toHaveAttribute("data-action-level", "text-link");
    expect(financeAction).toHaveClass("text-xs", "font-semibold");
    expect(salesAction).toHaveClass("text-xs", "font-semibold");
    expect(screen.getByRole("heading", { name: dynamics })).toBeInTheDocument();
    expect(container.querySelector('[data-dashboard-chart-type="bar-timeline"]')).toBeInTheDocument();
    expect(container.querySelector('[data-dashboard-chart-type="line"] svg polyline')).toBeInTheDocument();
    expect(container.querySelector("[data-payment-plot]")).toHaveClass("h-20");
    expect(container.querySelector('[data-dashboard-chart-type="line"] .h-20')).toBeInTheDocument();
    expect(container.querySelector("[data-payment-axis]")).toHaveClass("h-7");
    expect(container.querySelector("[data-sales-axis]")).toHaveClass("h-7");
    expect(container.querySelector("[data-dashboard-payment-list]")).toBeNull();
    expect(container.querySelector('[data-sales-currency-summary="MDL"]')?.textContent).toMatch(locale === "ro" ? /75\.000,00\sMDL/ : /75\s000,00\sMDL/);
    expect(container.querySelectorAll("[data-sales-month]")).toHaveLength(5);
  });

  it("switches the Finance graph through 30 / 60 / 90 / 180 day projections", async () => {
    const base = financeGuidanceData();
    mocks.getWorkspaceHomeAction.mockResolvedValue({ success: true, data: {
      ...workspaceData(),
      financeGuidance: {
        ...base,
        periods: [30, 60, 90, 180].map((days) => ({
          ...base,
          days,
          calendar: { ...base.calendar, startDate: `2026-${days === 30 ? "08-09" : days === 60 ? "07-10" : days === 90 ? "06-10" : "03-12"}` },
        })),
      },
    } });
    const user = userEvent.setup();
    const { container } = render(await CabinetPage());
    expect(container.querySelector('[data-finance-period-panel="30"]')).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "60 дн." }));
    expect(container.querySelector('[data-finance-period-panel="60"]')).toBeInTheDocument();
    expect(screen.getByText(/10 июл. 2026 г./)).toBeInTheDocument();
  });

  it.each([
    ["ru", "За этот период проведённых заказов у Novotech нет."],
    ["ro", "Nu există comenzi validate la Novotech în această perioadă."],
  ])("renders a truthful Sales empty state in %s", async (locale, message) => {
    mocks.getPartnerLocale.mockResolvedValue(locale);
    mocks.getWorkspaceHomeAction.mockResolvedValue({
      success: true,
      data: { ...workspaceData(), salesAnalytics: { ...salesAnalyticsData(), totalOrderCount: 0, series: [] } },
    });

    render(await CabinetPage());
    expect(screen.getByText(message)).toHaveAttribute("data-sales-empty");
    expect(screen.queryByRole("img", { name: /Динамика закупок|Dinamica achizițiilor/ })).not.toBeInTheDocument();
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
    expect(screen.getByText("NSUU-1")).toBeInTheDocument();
    expect(screen.queryByText("Откройте заказ и уточните дату.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Скрыть сообщение" })).not.toBeInTheDocument();
  });

  it("uses one current sales opportunity and shared compact card geometry", async () => {
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
    const cards = [...container.querySelectorAll("[data-dashboard-overview-card]")];
    expect(cards).toHaveLength(5);
    expect(cards.every((card) => card.className === cards[0].className)).toBe(true);
    expect(cards[1]).toHaveTextContent("Предложение ещё не открыто");
    expect(cards[1].querySelector("[data-overview-secondary]")).toHaveTextContent("KP-1");
    expect(cards[1].querySelector("a")).toHaveAttribute("href", "/cabinet/estimates/estimate-1");
    expect(cards[1]).not.toHaveTextContent("Customer");
    expect(cards[1]).not.toHaveTextContent("100");
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
    const card = container.querySelector('[data-dashboard-overview-card="attention"]');
    expect(card?.querySelector("[data-overview-primary]")).toHaveTextContent("1");
    expect(card?.querySelector("[data-overview-secondary]")).toHaveTextContent("TEST-1");
    expect(card).not.toHaveTextContent("Old body");
    expect(screen.queryByText(locale === "ru" ? "Тестовый" : "Test", { exact: true })).toBeNull();
    expect(card?.querySelector('a')).toHaveAttribute("href", "/cabinet/orders/test-order");
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

  it("keeps only Repeat Purchase period state on the personal Dashboard", async () => {
    await CabinetPage({ searchParams: Promise.resolve({ period: "60" }) });
    expect(mocks.getWorkspaceHomeAction).toHaveBeenCalledWith({ repeat: 60 });

    await expect(CabinetPage({ searchParams: Promise.resolve({ period: "90", hotPeriod: "30" }) }))
      .rejects.toThrow("NEXT_REDIRECT:/cabinet?period=90");
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
        { key: "finance", label: "Финансы", href: "/cabinet/finance", icon: "finance", availability: "available" },
        { key: "proposals", label: "Сметы и КП", href: "/cabinet/estimates", icon: "proposals", availability: "available" },
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
    discoveryProducts: [],
    specialOfferProducts: [],
    opportunities: [],
    campaigns: [],
    recentDocuments: [],
    financeSummary: null,
    salesAnalytics: null,
    companySummary: null,
    commercialConfigurationMissing: false,
    purchasingDynamics: null,
    commercialFreshness: [],
  };
}

function financeGuidanceData() {
  return {
    state: "healthy",
    totals: [],
    nextDueDate: null,
    fresh: true,
    calendar: {
      startDate: "2026-05-11",
      endDate: "2026-09-08",
      today: "2026-09-08",
      todayPosition: 100,
      amountScaleMaximum: 0,
      axisLabels: [
        { date: "2026-05-11", kind: "start", positionPercent: 0, track: 0, showOnMobile: true, align: "start" },
        { date: "2026-09-08", kind: "today", positionPercent: 100, track: 0, showOnMobile: true, align: "end" },
      ],
    },
    paymentGraph: [],
  };
}

function salesAnalyticsData() {
  return {
    businessDate: "2026-09-08",
    periodStart: "2025-10-01",
    periodEnd: "2026-09-08",
    totalOrderCount: 3,
    series: [{
      currency: "MDL",
      total: 75_000,
      orderCount: 3,
      averageOrder: 25_000,
      comparisons: [30, 60, 90, 180].map((days) => ({
        days,
        currentStart: days === 30 ? "2026-08-10" : "2026-03-13",
        currentEnd: "2026-09-08",
        previousStart: days === 30 ? "2025-08-10" : "2025-03-13",
        previousEnd: "2025-09-08",
        currentAmount: 75_000,
        previousAmount: 60_000,
        currentOrderCount: 3,
        previousOrderCount: 2,
        currentAverageOrder: 25_000,
        changePercent: 25,
        state: "INCREASE",
      })),
      points: Array.from({ length: 12 }, (_, index) => ({
        month: new Date(Date.UTC(2025, 9 + index, 1)).toISOString().slice(0, 10),
        amount: index === 9 ? 25_000 : index === 11 ? 50_000 : 0,
        orderCount: index === 9 ? 1 : index === 11 ? 2 : 0,
        xPercent: 2.5 + (index / 11) * 95,
        yPercent: index === 9 ? 55 : index === 11 ? 20 : 90,
        showLabel: index === 0 || index === 11 || index % 3 === 0,
        showLabelOnMobile: index === 0 || index === 6 || index === 11,
        labelAlign: index === 0 ? "start" : index === 11 ? "end" : "center",
      })),
    }],
  };
}

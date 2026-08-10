import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PartnerHeader } from "../PartnerHeader";
import { PartnerMobileNavigation } from "../PartnerMobileNavigation";
import { PartnerSidebar } from "../PartnerSidebar";
import { CompanyCard } from "../CompanyCard";
import { resolveWorkspaceCapabilities } from "../../services";

let pathname = "/cabinet";

vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/src/modules/auth/actions/auth.actions", () => ({ signOutAction: vi.fn() }));

const context = {
  userDisplayName: "Partner User",
  userEmail: "partner@example.com",
  companyName: "Partner Company",
  membershipRole: "Владелец компании",
  membershipRoleCode: "partner_owner",
  companyLogoUrl: null,
  partnerStatus: "GOLD",
  quickActions: [],
  accessState: "active" as const,
  navigation: resolveWorkspaceCapabilities(new Set(["catalog.view", "opportunities.view", "campaigns.view", "orders.create", "orders.manage", "purchasing_lists.view", "purchase_templates.view", "reservations.manage", "specifications.manage", "estimates.view", "estimates.manage", "finance.view_company", "documents.view_company", "service.view", "support.view", "knowledge.view"])).navigation,
  cartItemCount: 0,
  notificationSummary: { unreadCount: 0, items: [] },
};

const navigation = context.navigation;

describe("Partner workspace shell", () => {
  beforeEach(() => {
    pathname = "/cabinet";
  });

  it("renders business identity without raw role IDs", async () => {
    const user = userEvent.setup();
    render(<PartnerHeader context={context} />);

    expect(screen.getByText("Partner User")).toBeInTheDocument();
    expect(screen.queryByText("Рабочее пространство")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Открыть меню пользователя" }));
    expect(screen.getByText("Владелец компании")).toBeInTheDocument();
    expect(screen.queryByText("role-1")).not.toBeInTheDocument();
  });

  it("presents the commercial tier as partner status", () => {
    render(<CompanyCard context={{
      userId: "user-1",
      userDisplayName: "Partner User",
      userEmail: "partner@example.com",
      profileStatus: "active",
      accessState: "active",
      companyId: "company-1",
      companyName: "Partner Company",
      companyStatus: "active",
      membershipId: "membership-1",
      membershipStatus: "active",
      membershipRole: "Владелец компании",
      membershipRoleCode: "partner_owner",
      companyLogoAssetPath: null,
      companyLogoUrl: null,
      canManageCompanyLogo: true,
      external1cCode: "UU-001940",
      external1cPriceTypeId: "price-type-1",
      priceTypeName: "PLATINUM",
      capabilities: resolveWorkspaceCapabilities(new Set([
        "pricing.partner_price.view",
      ])),
    }} />);

    expect(screen.getByText("Статус партнёра")).toBeInTheDocument();
    expect(screen.getByText("PLATINUM")).toBeInTheDocument();
    expect(screen.queryByText("Вид цены")).not.toBeInTheDocument();
  });

  it("renders the final information architecture with consolidated commercial groups", async () => {
    const user = userEvent.setup();
    render(<PartnerSidebar hasWorkspaceAccess navigation={navigation} />);

    expect(screen.getByRole("link", { name: "Рабочий стол" })).toHaveAttribute("href", "/cabinet");
    expect(screen.getByRole("link", { name: "Каталог товаров" })).toHaveAttribute("href", "/cabinet/catalog");

    const topLevelLabels = Array.from(document.querySelectorAll("nav > div > a, nav > div > span, nav > div > div > button"))
      .map((item) => item.querySelector(":scope > span.flex-1")?.textContent?.trim() ?? item.textContent?.trim());
    expect(topLevelLabels).toEqual([
      "Рабочий стол",
      "Каталог товаров",
      "Возможности для закупки",
      "Специальные предложения",
      "Подбор товаров",
      "Проектная защита",
      "Сметы и КП",
      "Заказы и финансы",
      "Программы лояльности",
      "Гарантия и техподдержка",
    ]);

    const selectionButton = screen.getByRole("button", { name: "Подбор товаров" });
    await user.click(selectionButton);
    const selectionGroup = within(document.getElementById("product-selection-navigation")!);
    expect(selectionGroup.getByRole("link", { name: "Избранное" })).toHaveAttribute("href", "/cabinet/purchasing-lists");
    expect(selectionGroup.getByRole("link", { name: "Шаблоны закупок" })).toHaveAttribute("href", "/cabinet/purchase-templates");
    expect(selectionGroup.getByRole("link", { name: "Сравнение" })).toHaveAttribute("href", "/cabinet/compare");

    const projectButton = screen.getByRole("button", { name: "Проектная защита" });
    await user.click(projectButton);
    const projectGroup = within(document.getElementById("project-protection-navigation")!);
    expect(projectGroup.getByRole("link", { name: "Резервирование" })).toHaveAttribute("href", "/cabinet/reservation-requests");
    expect(projectGroup.getByText("Подбор решения")).toBeInTheDocument();
    expect(projectGroup.queryByRole("link", { name: "Подбор решения" })).not.toBeInTheDocument();
    expect(projectGroup.getByRole("link", { name: "Спецификации" })).toHaveAttribute("href", "/cabinet/specifications");

    expect(screen.getByRole("link", { name: "Возможности для закупки" })).toHaveAttribute("href", "/cabinet/opportunities");
    expect(screen.getByRole("link", { name: "Специальные предложения" })).toHaveAttribute("href", "/cabinet/offers");

    const estimatesButton = screen.getByRole("button", { name: "Сметы и КП" });
    expect(estimatesButton).toHaveAttribute("aria-expanded", "false");
    await user.click(estimatesButton);
    const estimatesGroup = within(document.getElementById("estimates-navigation")!);
    expect(estimatesGroup.getByRole("link", { name: "Мои сметы" })).toHaveAttribute("href", "/cabinet/estimates");
    expect(estimatesGroup.getByRole("link", { name: "Мои заказчики" })).toHaveAttribute("href", "/cabinet/customers");
    expect(estimatesGroup.getByRole("link", { name: "Моя номенклатура" })).toHaveAttribute("href", "/cabinet/nomenclature");
    expect(estimatesGroup.getByRole("link", { name: "Генератор КП" })).toHaveAttribute("href", "/cabinet/estimates/generator");
    expect(estimatesGroup.queryByText("Сметы и коммерческие предложения")).not.toBeInTheDocument();
    expect(estimatesGroup.queryByRole("link", { name: "Подбор решения" })).not.toBeInTheDocument();
    expect(estimatesGroup.queryByRole("link", { name: "Избранное" })).not.toBeInTheDocument();
    expect(estimatesGroup.queryByRole("link", { name: "Возможности для закупки" })).not.toBeInTheDocument();
    expect(estimatesGroup.queryByRole("link", { name: "Специальные предложения" })).not.toBeInTheDocument();

    const commercialButton = screen.getByRole("button", { name: "Заказы и финансы" });
    expect(commercialButton).toHaveAttribute("aria-expanded", "false");
    await user.click(commercialButton);
    expect(screen.getByRole("link", { name: "Заказы" })).toHaveAttribute("href", "/cabinet/orders");
    expect(screen.getByRole("link", { name: "Финансы" })).toHaveAttribute("href", "/cabinet/finance");
    expect(screen.getByRole("link", { name: "Документы" })).toHaveAttribute("href", "/cabinet/documents");
    const supportButton = screen.getByRole("button", { name: "Гарантия и техподдержка" });
    await user.click(supportButton);
    const supportGroup = within(document.getElementById("support-navigation")!);
    expect(supportGroup.getByRole("link", { name: "Сервисный центр" })).toHaveAttribute("href", "/cabinet/service");
    expect(supportGroup.getByRole("link", { name: "IT-поддержка" })).toHaveAttribute("href", "/cabinet/support");
    expect(supportGroup.getByRole("link", { name: "База знаний" })).toHaveAttribute("href", "/cabinet/knowledge");
    expect(supportGroup.queryByText("Скоро")).not.toBeInTheDocument();
    expect(screen.queryByText("Моя компания")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Корзина/ })).not.toBeInTheDocument();

    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    for (const href of hrefs) expect(hrefs.filter((candidate) => candidate === href)).toHaveLength(1);
  });

  it("moves cart and sign out into the operational header", async () => {
    const user = userEvent.setup();
    render(<PartnerHeader context={{ ...context, cartItemCount: 125 }} />);
    expect(screen.getByRole("link", { name: "Корзина: 125 позиций" })).toHaveAttribute("href", "/cabinet/cart");
    expect(screen.queryByRole("button", { name: "Выйти" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Открыть меню пользователя" }));
    expect(screen.getByRole("menuitem", { name: "Выйти" })).toBeInTheDocument();
  });

  it("hydrates only the mobile navigation island and dismisses its drawer", async () => {
    const user = userEvent.setup();
    render(<PartnerMobileNavigation hasWorkspaceAccess navigation={navigation} />);

    const trigger = screen.getByRole("button", { name: "Открыть навигацию" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("navigation", { name: "Рабочие разделы" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Закрыть навигацию" }));
    expect(screen.queryByRole("navigation", { name: "Рабочие разделы" })).not.toBeInTheDocument();
  });

  it("dismisses the user menu outside and on Escape with focus restoration", async () => {
    const user = userEvent.setup();
    render(<div><PartnerHeader context={context} /><button type="button">Снаружи</button></div>);
    const trigger = screen.getByRole("button", { name: "Открыть меню пользователя" });
    await user.click(trigger);
    expect(screen.getByRole("menu", { name: "Меню пользователя" })).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Снаружи" }));
    expect(screen.queryByRole("menu", { name: "Меню пользователя" })).not.toBeInTheDocument();
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Меню пользователя" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("shows governed quick actions in the header and dismisses the menu safely", async () => {
    const user = userEvent.setup();
    render(<div><PartnerHeader context={{
      ...context,
      quickActions: [{ key: "cart", label: "Открыть корзину", href: "/cabinet/cart" }],
    }} /><button type="button">Снаружи</button></div>);
    const trigger = screen.getByRole("button", { name: "Быстрые действия" });

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Открыть корзину" })).toHaveAttribute("href", "/cabinet/cart");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Снаружи" }));
    expect(screen.queryByRole("menuitem", { name: "Открыть корзину" })).not.toBeInTheDocument();

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("shows the role, partner status, and company identity in the user menu", async () => {
    const user = userEvent.setup();
    render(<PartnerHeader context={context} />);
    await user.click(screen.getByRole("button", { name: "Открыть меню пользователя" }));

    expect(screen.getByText("GOLD")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Partner Company" })).toHaveTextContent("PC");
  });

  it("automatically expands the commercial group for an active child route", () => {
    pathname = "/cabinet/finance";
    render(<PartnerSidebar hasWorkspaceAccess navigation={navigation} />);

    expect(screen.getByRole("button", { name: "Заказы и финансы" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Финансы" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Заказы и финансы" })).not.toHaveAttribute("aria-current");
  });

  it("supports keyboard expansion and collapse", async () => {
    const user = userEvent.setup();
    render(<PartnerSidebar hasWorkspaceAccess navigation={navigation} />);
    const groupButton = screen.getByRole("button", { name: "Заказы и финансы" });

    groupButton.focus();
    await user.keyboard("{Enter}");
    expect(groupButton).toHaveAttribute("aria-expanded", "true");
    await user.keyboard(" ");
    expect(groupButton).toHaveAttribute("aria-expanded", "false");
  });

  it("hides empty groups and keeps restricted children out of navigation", async () => {
    const user = userEvent.setup();
    const ordersOnly = resolveWorkspaceCapabilities(new Set(["orders.manage"])).navigation;
    const { rerender } = render(<PartnerSidebar hasWorkspaceAccess navigation={ordersOnly} />);

    expect(screen.queryByRole("button", { name: "Сметы и КП" })).not.toBeInTheDocument();
    const commercialButton = screen.getByRole("button", { name: "Заказы и финансы" });
    await user.click(commercialButton);
    expect(screen.getByRole("link", { name: "Заказы" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Финансы" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Документы" })).not.toBeInTheDocument();

    rerender(<PartnerSidebar hasWorkspaceAccess navigation={resolveWorkspaceCapabilities(new Set()).navigation} />);
    expect(screen.queryByRole("button", { name: "Заказы и финансы" })).not.toBeInTheDocument();
  });

  it("keeps company access in the user menu while omitting it from the sidebar", async () => {
    const user = userEvent.setup();
    render(<><PartnerSidebar navigation={navigation} /><PartnerHeader context={context} /></>);

    expect(screen.queryByRole("link", { name: "Моя компания" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Открыть меню пользователя" }));
    expect(screen.getByRole("menuitem", { name: "Моя компания" })).toHaveAttribute("href", "/cabinet/company");
  });

  it("restores active group state from the current route on a fresh render", () => {
    pathname = "/cabinet/estimates/estimate-1";
    render(<PartnerSidebar hasWorkspaceAccess navigation={navigation} />);

    expect(screen.getByRole("button", { name: "Сметы и КП" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Мои сметы" })).toHaveAttribute("aria-current", "page");
  });

  it.each([
    "/cabinet/service",
    "/cabinet/service/new",
    "/cabinet/service/11111111-1111-1111-1111-111111111111",
  ])("keeps the service entry active for %s", (route) => {
    pathname = route;
    render(<PartnerSidebar hasWorkspaceAccess navigation={navigation} />);

    expect(screen.getByRole("button", { name: "Гарантия и техподдержка" })).toHaveAttribute("aria-expanded", "true");
    const serviceLink = screen.getByRole("link", { name: "Сервисный центр" });
    expect(serviceLink).toHaveAttribute("href", "/cabinet/service");
    expect(serviceLink).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link", { name: "Сервисный центр" })).toHaveLength(1);
    expect(serviceLink).not.toHaveTextContent("Скоро");
  });

  it("omits service navigation when the effective permission is absent", () => {
    const unauthorized = resolveWorkspaceCapabilities(new Set(["catalog.view"])).navigation;
    render(<PartnerSidebar hasWorkspaceAccess navigation={unauthorized} />);

    expect(screen.queryByText("Сервисный центр")).not.toBeInTheDocument();
  });

  it("opens each restored parent for its active child route", () => {
    pathname = "/cabinet/specifications/specification-1";
    const { unmount } = render(<PartnerSidebar hasWorkspaceAccess navigation={navigation} />);
    expect(screen.getByRole("button", { name: "Проектная защита" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Спецификации" })).toHaveAttribute("aria-current", "page");
    unmount();

    pathname = "/cabinet/purchase-templates/template-1";
    render(<PartnerSidebar hasWorkspaceAccess navigation={navigation} />);
    expect(screen.getByRole("button", { name: "Подбор товаров" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Шаблоны закупок" })).toHaveAttribute("aria-current", "page");
  });

  it("does not link commercial modules when workspace access is blocked", () => {
    render(<PartnerSidebar hasWorkspaceAccess={false} navigation={navigation} />);

    expect(screen.getByText("Рабочий стол")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Рабочий стол" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Каталог товаров" })).not.toBeInTheDocument();
  });
});

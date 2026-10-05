import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PartnerHeader } from "../PartnerHeader";
import { PartnerMobileNavigation } from "../PartnerMobileNavigation";
import { PartnerSidebar } from "../PartnerSidebar";
import { PartnerDesktopSidebar } from "../PartnerDesktopSidebar";
import { CompanyCard } from "../CompanyCard";
import { resolveWorkspaceCapabilities } from "../../services";

let pathname = "/cabinet";
let query = "";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(query),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/src/modules/auth/actions/auth.actions", () => ({ signOutAction: vi.fn() }));

const context = {
  locale: "ru" as const,
  userDisplayName: "Partner User",
  userEmail: "partner@example.com",
  companyName: "Partner Company",
  membershipRole: "Владелец компании",
  membershipRoleCode: "partner_owner",
  companyLogoUrl: null,
  partnerStatus: "GOLD",
  quickActions: [],
  accessState: "active" as const,
  navigation: resolveWorkspaceCapabilities(new Set(["catalog.view", "opportunities.view", "campaigns.view", "orders.create", "orders.manage", "purchasing_lists.view", "purchase_templates.view", "reservations.manage", "specifications.manage", "estimates.view", "estimates.manage", "finance.view_company", "documents.view_company", "service.view", "support.view", "knowledge.view", "installation_marketplace.manage"])).navigation,
  cartItemCount: 0,
  notificationSummary: { unreadCount: 0, items: [] },
};

const navigation = context.navigation;

describe("Partner workspace shell", () => {
  beforeEach(() => {
    pathname = "/cabinet";
    query = "";
    document.cookie = "partner_sidebar_collapsed=; Path=/; Max-Age=0";
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

    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-sidebar-section]"));
    expect(sections.map((section) => section.dataset.sidebarSection)).toEqual([
      "business",
      "products",
      "sales",
      "support",
    ]);
    expect(sections.map((section) => within(section).getByRole("heading", { level: 2 }).textContent)).toEqual([
      "БИЗНЕС",
      "ЗАКУПКИ",
      "ПРОДАЖИ",
      "ПОДДЕРЖКА",
    ]);

    const topLevelLabels = (section: HTMLElement) => Array.from(section.querySelectorAll<HTMLElement>('[data-sidebar-top-level="true"]'))
      .map((item) => item.querySelector(":scope > span.flex-1")?.textContent?.trim() ?? item.textContent?.trim());
    expect(topLevelLabels(sections[0]!)).toEqual(["Рабочий стол", "Заказы и финансы"]);
    expect(topLevelLabels(sections[1]!)).toEqual(["ТОВАРЫ", "Покупки", "Подборки"]);
    expect(topLevelLabels(sections[2]!)).toEqual(["Сметы и КП", "Монтаж и заявки", "Проектная защита"]);
    expect(topLevelLabels(sections[3]!)).toEqual(["Экспертиза Novotech", "Программы лояльности", "Гарантия и техподдержка"]);
    expect(document.querySelector("[data-sidebar-font]")).not.toBeInTheDocument();

    const productsButton = screen.getByRole("button", { name: "ТОВАРЫ" });
    expect(productsButton).toHaveAttribute("aria-expanded", "false");
    await user.click(productsButton);
    const products = within(document.getElementById("products-navigation")!);
    expect(products.getAllByRole("link").map((link) => link.textContent)).toEqual(["Витрина", "Каталог товаров"]);
    expect(products.getByRole("link", { name: "Витрина" })).toHaveAttribute("href", "/cabinet/catalog");
    expect(products.getByRole("link", { name: "Каталог товаров" })).toHaveAttribute("href", "/cabinet/catalog?view=all");
    expect(products.getAllByRole("link").every((link) => link.dataset.sidebarSubmenuItem === "true")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Экспертиза Novotech" }));
    const expertiseGroup = within(document.getElementById("expertise-navigation")!);
    expect(expertiseGroup.getByRole("link", { name: "Лаборатория Novotech" })).toHaveAttribute("href", "/cabinet/expertise/lab");
    expect(expertiseGroup.getByRole("link", { name: "Академия Novotech" })).toHaveAttribute("href", "/cabinet/expertise/academy");

    await user.click(screen.getByRole("button", { name: "Монтаж и заявки" }));
    const installationGroup = within(document.getElementById("installation-navigation")!);
    expect(installationGroup.getByRole("link", { name: "Статус монтажей" })).toHaveAttribute("href", "/cabinet/installation-marketplace?view=overview");
    expect(installationGroup.getByRole("link", { name: "Профиль инсталлятора" })).toHaveAttribute("href", "/cabinet/installation-marketplace?view=profile");

    const selectionButton = screen.getByRole("button", { name: "Покупки" });
    await user.click(selectionButton);
    const purchases = within(document.getElementById("purchases-navigation")!);
    expect(purchases.getAllByRole("link").map((link) => link.textContent)).toEqual(["Подбор товаров", "Возможности для закупки", "Специальные предложения"]);
    expect(purchases.getAllByRole("link").every((link) => link.dataset.sidebarSubmenuItem === "true")).toBe(true);
    const collectionsButton = screen.getByRole("button", { name: "Подборки" });
    await user.click(collectionsButton);
    const selectionGroup = within(document.getElementById("collections-navigation")!);
    expect(selectionGroup.getByRole("link", { name: "Избранное" })).toHaveAttribute("href", "/cabinet/purchasing-lists?filter=favorites");
    expect(selectionGroup.getByRole("link", { name: "Мои комплекты" })).toHaveAttribute("href", "/cabinet/purchasing-lists");
    expect(selectionGroup.getByRole("link", { name: "Сравнение" })).toHaveAttribute("href", "/cabinet/compare");
    expect(selectionGroup.getAllByRole("link").every((link) => link.dataset.sidebarSubmenuItem === "true")).toBe(true);

    const projectButton = screen.getByRole("button", { name: "Проектная защита" });
    await user.click(projectButton);
    const projectGroup = within(document.getElementById("project-protection-navigation")!);
    expect(projectGroup.getByRole("link", { name: "Резервирование" })).toHaveAttribute("href", "/cabinet/reservation-requests");
    expect(projectGroup.getByText("Подбор решения")).toBeInTheDocument();
    expect(projectGroup.queryByRole("link", { name: "Подбор решения" })).not.toBeInTheDocument();
    expect(projectGroup.getByRole("link", { name: "Спецификации" })).toHaveAttribute("href", "/cabinet/specifications");

    await user.click(screen.getByRole("button", { name: "Покупки" }));
    expect(screen.getByRole("link", { name: "Подбор товаров" })).toHaveAttribute("href", "/cabinet/quick-order");
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

  it("keeps one accessible navigation model in the collapsed icon rail", async () => {
    pathname = "/cabinet/offers";
    const onCollapsedChange = vi.fn();
    const user = userEvent.setup();
    render(<PartnerSidebar collapsed hasWorkspaceAccess navigation={navigation} onCollapsedChange={onCollapsedChange} />);

    expect(screen.getByText("NOVOTECH")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Развернуть главное меню" })).toBeInTheDocument();
    const purchases = screen.getByRole("button", { name: "Покупки: Специальные предложения" });
    expect(purchases).toHaveClass("text-emerald-200");
    expect(purchases).toHaveAttribute("aria-expanded", "false");
    await user.click(purchases);
    expect(onCollapsedChange).toHaveBeenCalledWith(false);
  });

  it("persists desktop sidebar collapse without replacing the navigation tree", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div data-partner-portal data-sidebar-collapsed="false">
        <PartnerDesktopSidebar companyName={context.companyName} hasWorkspaceAccess initialCollapsed={false} navigation={navigation} />
      </div>,
    );
    expect(container.querySelector("[data-partner-sidebar-shell]")).toHaveAttribute("data-sidebar-collapsed", "false");
    await user.click(screen.getByRole("button", { name: "Свернуть главное меню" }));
    expect(container.querySelector("[data-partner-sidebar-shell]")).toHaveAttribute("data-sidebar-collapsed", "true");
    expect(container.querySelector("[data-partner-portal]")).toHaveAttribute("data-sidebar-collapsed", "true");
    expect(document.cookie).toContain("partner_sidebar_collapsed=1");
    expect(screen.getAllByRole("navigation", { name: "Рабочие разделы" })).toHaveLength(1);
  });

  it("uses one alignment slot for every collapsed top-level icon", () => {
    pathname = "/cabinet";
    render(<PartnerSidebar collapsed hasWorkspaceAccess navigation={navigation} onCollapsedChange={vi.fn()} />);

    const topLevelItems = Array.from(document.querySelectorAll<HTMLElement>('[data-sidebar-top-level="true"]'));
    expect(topLevelItems.length).toBeGreaterThan(1);
    for (const item of topLevelItems) {
      expect(item).toHaveClass("min-h-10", "w-full", "justify-center", "gap-0", "px-2", "py-2");
      expect(item.querySelector("[data-sidebar-icon-slot]")).toHaveClass("inline-flex", "size-4", "shrink-0", "items-center", "justify-center");
    }

    const dashboard = document.querySelector<HTMLElement>('[data-sidebar-top-level="true"][href="/cabinet"]');
    expect(dashboard).toBeInTheDocument();
    expect(dashboard?.querySelector("[data-sidebar-icon-slot]")).toBeInTheDocument();
    expect(dashboard?.querySelector('[class*="animate-spin"]')).not.toBeInTheDocument();
  });

  it("moves cart and sign out into the operational header", async () => {
    const user = userEvent.setup();
    render(<PartnerHeader context={{ ...context, cartItemCount: 125 }} />);
    expect(screen.getByRole("link", { name: "Корзина: 125 позиций" })).toHaveAttribute("href", "/cabinet/cart");
    expect(screen.queryByRole("button", { name: "Выйти" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Открыть меню пользователя" }));
    expect(screen.getByRole("menuitem", { name: "Выйти" })).toBeInTheDocument();
  });

  it("keeps operational header controls at stable 44px geometry", () => {
    render(<PartnerHeader context={{
      ...context,
      cartItemCount: 125,
      quickActions: [{ key: "cart", label: "Открыть корзину", href: "/cabinet/cart" }],
      notificationSummary: { unreadCount: 125, items: [] },
    }} />);

    for (const control of document.querySelectorAll("[data-header-control]")) {
      expect(control).toHaveClass("size-11", "shrink-0");
    }
    expect(screen.getByRole("link", { name: "Корзина: 125 позиций" })).toHaveClass("size-11", "shrink-0");
    expect(screen.getByTestId("partner-header-actions")).toHaveClass("gap-2");
  });

  it("exposes the governed mobile product shortcut without adding a navigation item", () => {
    render(<PartnerHeader context={context} />);

    expect(screen.getByRole("link", { name: "Найти товар" })).toHaveAttribute("href", "/cabinet/quick-order");
    expect(navigation.some((item) => item.href === "/cabinet/quick-order")).toBe(false);
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
      quickActions: [
        { key: "cart", label: "Открыть корзину", href: "/cabinet/cart" },
        { key: "quick_product_selection", label: "Быстрый подбор товаров", href: "/cabinet/quick-order" },
      ],
    }} /><button type="button">Снаружи</button></div>);
    const trigger = screen.getByRole("button", { name: "Быстрые действия" });

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Открыть подборку" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Быстрый подбор товаров" })).toHaveAttribute("href", "/cabinet/quick-order");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Снаружи" }));
    expect(screen.queryByRole("menuitem", { name: "Открыть подборку" })).not.toBeInTheDocument();

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
    const languageAction = screen.getByRole("menuitem", { name: "Переключить интерфейс на румынский" });
    expect(within(languageAction).getByText("Язык")).toBeInTheDocument();
    expect(within(languageAction).getByText("Русский")).toBeInTheDocument();
    expect(within(languageAction).getByText("Română")).toBeInTheDocument();
    expect(document.querySelector('[data-header-control="language"]')).toBeNull();
  });

  it.each([
    ["", "Витрина", "/cabinet/catalog"],
    ["view=all", "Каталог товаров", "/cabinet/catalog?view=all"],
  ])("opens products and highlights the governed catalog mode for %s", (search, label, href) => {
    pathname = "/cabinet/catalog";
    query = search;
    render(<PartnerSidebar hasWorkspaceAccess navigation={navigation} />);

    expect(screen.getByRole("button", { name: "ТОВАРЫ" })).toHaveAttribute("aria-expanded", "true");
    const selected = document.querySelectorAll('#products-navigation a[aria-current="page"]');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent(label);
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
    expect(screen.getByRole("link", { name: label })).toHaveClass("bg-emerald-500/15");
  });

  it("automatically expands the commercial group for an active child route", () => {
    pathname = "/cabinet/finance";
    render(<PartnerSidebar hasWorkspaceAccess navigation={navigation} />);

    expect(screen.getByRole("button", { name: "Заказы и финансы" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Финансы" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Заказы и финансы" })).not.toHaveAttribute("aria-current");
  });

  it("applies the compact sidebar typography hierarchy", () => {
    pathname = "/cabinet/catalog";
    render(<PartnerSidebar hasWorkspaceAccess navigation={navigation} />);

    for (const heading of document.querySelectorAll<HTMLElement>("[data-sidebar-section] h2")) {
      expect(heading).toHaveClass(
        "text-[10px]",
        "font-medium",
        "uppercase",
        "tracking-[0.16em]",
      );
    }

    expect(document.querySelector('[data-sidebar-top-level="true"][href="/cabinet"]')).toHaveClass(
      "min-h-9",
      "text-xs",
      "font-semibold",
    );
    expect(document.querySelector('button[data-sidebar-top-level="true"][aria-controls="products-navigation"]')).toHaveClass(
      "min-h-9",
      "text-xs",
      "font-semibold",
    );

    const activeChild = document.querySelector('#products-navigation a[aria-current="page"]');
    const inactiveChild = document.querySelector('#products-navigation a[href="/cabinet/catalog?view=all"]');
    expect(activeChild).toHaveClass("min-h-8", "text-[11px]", "font-semibold");
    expect(inactiveChild).toHaveClass("min-h-8", "text-[11px]", "font-medium");
    expect(inactiveChild).not.toHaveClass("font-semibold");
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

  it("expands and collapses the collections group", async () => {
    const user = userEvent.setup();
    render(<PartnerSidebar hasWorkspaceAccess navigation={navigation} />);
    const collections = screen.getByRole("button", { name: "Подборки" });

    expect(collections).toHaveAttribute("aria-expanded", "false");
    await user.click(collections);
    expect(collections).toHaveAttribute("aria-expanded", "true");
    expect(within(document.getElementById("collections-navigation")!).getAllByRole("link")).toHaveLength(3);
    await user.click(collections);
    expect(collections).toHaveAttribute("aria-expanded", "false");
  });

  it("expands and collapses the products group with exactly two children", async () => {
    const user = userEvent.setup();
    render(<PartnerSidebar hasWorkspaceAccess navigation={navigation} />);
    const products = screen.getByRole("button", { name: "ТОВАРЫ" });

    expect(products).toHaveAttribute("aria-expanded", "false");
    await user.click(products);
    expect(products).toHaveAttribute("aria-expanded", "true");
    expect(within(document.getElementById("products-navigation")!).getAllByRole("link")).toHaveLength(2);
    await user.click(products);
    expect(products).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps only one expandable navigation group open", async () => {
    const user = userEvent.setup();
    render(<PartnerSidebar hasWorkspaceAccess navigation={navigation} />);
    const estimates = screen.getByRole("button", { name: "Сметы и КП" });
    const commercial = screen.getByRole("button", { name: "Заказы и финансы" });

    await user.click(estimates);
    expect(estimates).toHaveAttribute("aria-expanded", "true");
    expect(commercial).toHaveAttribute("aria-expanded", "false");

    await user.click(commercial);
    expect(estimates).toHaveAttribute("aria-expanded", "false");
    expect(commercial).toHaveAttribute("aria-expanded", "true");
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

    pathname = "/cabinet/purchasing-lists/kit-1";
    render(<PartnerSidebar hasWorkspaceAccess navigation={navigation} />);
    expect(screen.getByRole("button", { name: "Подборки" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Мои комплекты" })).toHaveAttribute("aria-current", "page");
  });

  it.each([
    ["/cabinet/purchasing-lists", "filter=favorites", "Избранное"],
    ["/cabinet/purchasing-lists", "page=2&filter=favorites&search=test", "Избранное"],
    ["/cabinet/purchasing-lists", "", "Мои комплекты"],
    ["/cabinet/purchasing-lists", "filter=company", "Мои комплекты"],
    ["/cabinet/compare", "", "Сравнение"],
  ])("selects only the intended child for %s?%s", (path, search, label) => {
    pathname = path;
    query = search;
    render(<PartnerSidebar hasWorkspaceAccess navigation={navigation} />);
    const selected = document.querySelectorAll('#collections-navigation a[aria-current="page"]');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent(label);
    expect(selected[0]).toHaveClass("bg-emerald-500/15");
    for (const other of ["Избранное", "Мои комплекты", "Сравнение"].filter((name) => name !== label)) {
      expect(screen.getByRole("link", { name: other })).not.toHaveAttribute("aria-current");
      expect(screen.getByRole("link", { name: other })).not.toHaveClass("bg-emerald-500/15");
    }
    expect(screen.getByRole("button", { name: "Подборки" })).toHaveAttribute("aria-expanded", "true");
    for (const [name, icon] of [["Избранное", "star"], ["Мои комплекты", "layers"], ["Сравнение", "columns-3"]]) {
      const link = screen.getByRole("link", { name });
      expect(screen.getAllByRole("link", { name })).toHaveLength(1);
      expect(link.querySelector("svg")).toHaveClass("lucide-" + icon);
      expect(document.getElementById("purchases-navigation")).not.toContainElement(link);
      expect(document.getElementById("collections-navigation")).toContainElement(link);
    }
    const star = screen.getByRole("link", { name: "Избранное" }).querySelector("svg");
    expect(star).toHaveClass("lucide-star", "size-4", "shrink-0");
    expect(star).toHaveAttribute("fill", "none");
    expect(star).toHaveAttribute("stroke-width", "2");
  });

  it("updates active selection on query-only navigation without remounting", () => {
    pathname = "/cabinet/purchasing-lists";
    const { rerender } = render(<PartnerSidebar navigation={navigation} />);
    query = "filter=favorites";
    rerender(<PartnerSidebar navigation={navigation} />);
    expect(screen.getByRole("link", { name: "Избранное" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Мои комплекты" })).not.toHaveAttribute("aria-current");
    query = "";
    rerender(<PartnerSidebar navigation={navigation} />);
    expect(screen.getByRole("link", { name: "Мои комплекты" })).toHaveAttribute("aria-current", "page");
  });

  it("preserves Favorites selection and group interaction in the mobile drawer", async () => {
    pathname = "/cabinet/purchasing-lists";
    query = "filter=favorites";
    const user = userEvent.setup();
    render(<PartnerMobileNavigation hasWorkspaceAccess navigation={navigation} />);
    await user.click(screen.getByRole("button", { name: "Открыть навигацию" }));
    expect(screen.getByRole("link", { name: "Избранное" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Подборки" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Сметы и КП" }));
    expect(screen.getByRole("button", { name: "Подборки" })).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button", { name: "Подборки" }));
    expect(screen.getByRole("button", { name: "Подборки" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("link", { name: "Избранное" }));
    expect(screen.queryByRole("navigation", { name: "Рабочие разделы" })).not.toBeInTheDocument();
  });

  it.each([
    ["/cabinet/quick-order", "Подбор товаров"],
    ["/cabinet/opportunities", "Возможности для закупки"],
    ["/cabinet/offers", "Специальные предложения"],
  ])("opens and highlights purchases for direct URL %s", (route, label) => {
    pathname = route;
    render(<PartnerSidebar navigation={navigation} />);
    expect(screen.getByRole("button", { name: "Покупки" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Покупки" })).toHaveClass("text-emerald-200");
    expect(screen.getAllByRole("link", { name: label })).toHaveLength(1);
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
  });

  it("does not link commercial modules when workspace access is blocked", () => {
    render(<PartnerSidebar hasWorkspaceAccess={false} navigation={navigation} />);

    expect(screen.getByText("Рабочий стол")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Рабочий стол" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Каталог товаров" })).not.toBeInTheDocument();
  });
});

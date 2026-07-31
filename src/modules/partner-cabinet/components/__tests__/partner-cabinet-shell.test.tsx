import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PartnerHeader } from "../PartnerHeader";
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
  accessState: "active" as const,
  navigation: resolveWorkspaceCapabilities(new Set(["catalog.view", "orders.create", "orders.manage", "purchasing_lists.view", "reservations.manage", "specifications.manage", "estimates.view", "estimates.manage", "documents.view_company"])).navigation,
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
    expect(screen.getByText("Partner Company")).toBeInTheDocument();
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

  it("shows the requested hierarchy without duplicating the header cart in the sidebar", async () => {
    const user = userEvent.setup();
    render(<PartnerSidebar hasWorkspaceAccess navigation={navigation} />);

    expect(screen.getByRole("link", { name: "Рабочий стол" })).toHaveAttribute("href", "/cabinet");
    expect(screen.getByRole("link", { name: "Каталог" })).toHaveAttribute("href", "/cabinet/catalog");
    const selectionButton = screen.getByRole("button", { name: "Подбор товаров" });
    expect(selectionButton).toHaveAttribute("aria-expanded", "false");
    await user.click(selectionButton);
    expect(screen.getByRole("link", { name: "Избранное" })).toHaveAttribute("href", "/cabinet/purchasing-lists");
    expect(screen.getByRole("link", { name: "Сравнение" })).toHaveAttribute("href", "/cabinet/compare");
    expect(screen.queryByRole("link", { name: "Избранное и списки" })).not.toBeInTheDocument();
    const projectButton = screen.getByRole("button", { name: "Проектная защита" });
    expect(projectButton).toHaveAttribute("aria-expanded", "false");
    await user.click(projectButton);
    expect(projectButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Резервирование" })).toHaveAttribute("href", "/cabinet/reservation-requests");
    expect(screen.getByText("Подбор решения")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Спецификации" })).toHaveAttribute("href", "/cabinet/specifications");
    expect(screen.getByRole("link", { name: "Сметы и КП" })).toHaveAttribute("href", "/cabinet/estimates");
    expect(screen.getByText("Заказы")).toBeInTheDocument();
    expect(screen.getByText("Документы")).toBeInTheDocument();
    expect(screen.getByText("Сервис и гарантия")).toBeInTheDocument();
    expect(screen.getByText("База знаний")).toBeInTheDocument();
    expect(screen.queryByText("Точные остатки")).not.toBeInTheDocument();
    expect(screen.queryByText("Персональные цены")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();

    expect(screen.queryByRole("link", { name: /Корзина/ })).not.toBeInTheDocument();
  });

  it("moves cart and sign out into the operational header", async () => {
    const user = userEvent.setup();
    render(<PartnerHeader context={{ ...context, cartItemCount: 125 }} />);
    expect(screen.getByRole("link", { name: "Корзина: 125 позиций" })).toHaveAttribute("href", "/cabinet/cart");
    expect(screen.queryByRole("button", { name: "Выйти" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Открыть меню пользователя" }));
    expect(screen.getByRole("menuitem", { name: "Выйти" })).toBeInTheDocument();
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

  it("automatically expands the project submenu for an active child route", () => {
    pathname = "/cabinet/specifications/specification-1";
    render(<PartnerSidebar hasWorkspaceAccess navigation={navigation} />);

    expect(screen.getByRole("button", { name: "Проектная защита" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Спецификации" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Проектная защита" })).not.toHaveAttribute("aria-current");
  });

  it("supports keyboard expansion and collapse", async () => {
    const user = userEvent.setup();
    render(<PartnerSidebar hasWorkspaceAccess navigation={navigation} />);
    const projectButton = screen.getByRole("button", { name: "Проектная защита" });

    projectButton.focus();
    await user.keyboard("{Enter}");
    expect(projectButton).toHaveAttribute("aria-expanded", "true");
    await user.keyboard(" ");
    expect(projectButton).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps disabled project tools non-clickable", async () => {
    const user = userEvent.setup();
    render(<PartnerSidebar hasWorkspaceAccess navigation={navigation} />);

    await user.click(screen.getByRole("button", { name: "Проектная защита" }));
    expect(screen.getByText("Подбор решения")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Подбор решения" })).not.toBeInTheDocument();
  });

  it("does not link commercial modules when workspace access is blocked", () => {
    render(<PartnerSidebar hasWorkspaceAccess={false} navigation={navigation} />);

    expect(screen.getByText("Рабочий стол")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Рабочий стол" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Каталог" })).not.toBeInTheDocument();
  });
});

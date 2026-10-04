import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigationState = vi.hoisted(() => ({ pathname: "/cabinet/finance", query: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
  useSearchParams: () => new URLSearchParams(navigationState.query),
}));

import { PartnerPageBreadcrumbs } from "../PartnerPageBreadcrumbs";

describe("PartnerPageBreadcrumbs", () => {
  beforeEach(() => {
    navigationState.pathname = "/cabinet/finance";
    navigationState.query = "";
  });

  it.each([
    ["ru", "/cabinet/finance", "", "Кабинет/Финансы", "Финансы"],
    ["ru", "/cabinet/estimates", "", "Продажи/Сметы и КП/Мои сметы", "Мои сметы"],
    ["ru", "/cabinet/expertise/academy", "", "Поддержка/Экспертиза Novotech/Академия", "Академия"],
    ["ru", "/cabinet/catalog", "view=all", "Закупки/Товары/Каталог товаров", "Каталог товаров"],
    ["ru", "/cabinet/purchasing-lists", "filter=favorites", "Подборки/Избранное", "Избранное"],
    ["ro", "/cabinet/expertise/academy", "", "Suport/Expertiza Novotech/Academia", "Academia"],
    ["ro", "/cabinet/catalog", "view=all", "Achiziții/Produse/Catalog produse", "Catalog produse"],
  ] as const)("renders the compact localized hierarchy for %s %s?%s", (locale, pathname, query, text, title) => {
    navigationState.pathname = pathname;
    navigationState.query = query;
    render(<PartnerPageBreadcrumbs locale={locale} />);

    const breadcrumb = screen.getByRole("navigation", {
      name: locale === "ro" ? "Navigare ierarhică" : "Хлебные крошки",
    });
    expect(breadcrumb.textContent).toBe(text);
    expect(screen.getByRole("heading", { level: 1, name: title })).toHaveAttribute("aria-current", "page");
    expect(breadcrumb).toHaveAttribute("data-partner-breadcrumb-header");
  });

  it.each([
    ["/cabinet/catalog/product-slug", "Закупки/Товары/Товар"],
    ["/cabinet/orders/order-id", "Кабинет/Заказ"],
    ["/cabinet/documents/document-id", "Кабинет/Документ"],
    ["/cabinet/estimates/estimate-id/versions/version-id/preview", "Продажи/Сметы и КП/Предпросмотр КП"],
    ["/cabinet/installation-marketplace", "Продажи/Монтаж и заявки/Статус монтажей"],
    ["/cabinet/service/history/history-id", "Поддержка/Гарантия и техподдержка/История ремонта"],
  ])("covers dynamic Partner Cabinet route %s", (pathname, text) => {
    navigationState.pathname = pathname;
    render(<PartnerPageBreadcrumbs locale="ru" />);
    expect(screen.getByRole("navigation").textContent).toBe(text);
  });

  it("switches the installation breadcrumb from status to profile using the governed query", () => {
    navigationState.pathname = "/cabinet/installation-marketplace";
    navigationState.query = "view=profile";
    render(<PartnerPageBreadcrumbs locale="ru" />);
    expect(screen.getByRole("navigation").textContent).toBe("Продажи/Монтаж и заявки/Профиль инсталлятора");
  });
});

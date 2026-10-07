import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SUPPORTED_PARTNER_ROUTE_AREAS, resolvePartnerBreadcrumbs } from "../../../partner-locale/breadcrumbs";
const navigationState = vi.hoisted(() => ({ pathname: "/cabinet/finance", query: "" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigationState.pathname, useSearchParams: () => new URLSearchParams(navigationState.query) }));
import { PartnerPageBreadcrumbs } from "../PartnerPageBreadcrumbs";
describe("canonical linked Partner breadcrumbs", () => {
  it.each([
    ["ru", "/cabinet/finance", "", ["Рабочий стол", "Заказы и финансы", "Финансы"]],
    ["ru", "/cabinet/orders/order-id", "", ["Рабочий стол", "Заказы и финансы", "Заказы", "Заказ"]],
    ["ru", "/cabinet/catalog", "view=all", ["Рабочий стол", "Закупки", "Товары", "Каталог товаров"]],
    ["ru", "/cabinet/estimates/estimate-id/versions/version-id/preview", "", ["Рабочий стол", "Продажи", "Сметы и КП", "Предпросмотр КП"]],
    ["ru", "/cabinet/purchasing-lists", "filter=favorites", ["Рабочий стол", "Подборки", "Избранное"]],
    ["ro", "/cabinet/catalog", "view=all", ["Spațiu de lucru", "Achiziții", "Produse", "Catalog produse"]],
    ["ro", "/cabinet/expertise/academy", "", ["Spațiu de lucru", "Suport", "Expertiza Novotech", "Academia"]],
    ["ru", "/cabinet/installation-marketplace", "view=profile", ["Рабочий стол", "Продажи", "Монтаж и заявки", "Профиль инсталлятора"]],
  ] as const)("links every segment for %s %s?%s", (locale, pathname, query, labels) => {
    navigationState.pathname = pathname;
    navigationState.query = query;
    render(<PartnerPageBreadcrumbs locale={locale} />);
    const navigation = screen.getByRole("navigation");
    const links = within(navigation).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("title"))).toEqual(labels);
    expect(links[0]).toHaveAttribute("href", "/cabinet");
    expect(links[0].querySelector("svg")).toHaveClass("lucide-gauge");
    expect(links[0].textContent).toBe("");
    expect(links.at(-1)).toHaveAttribute("href", pathname + (query ? `?${query}` : ""));
    expect(links.at(-1)).toHaveAttribute("aria-current", "page");
    for (const link of links) expect(link.getAttribute("href")).toMatch(/^\/cabinet(?:[/?]|$)/);
    expect(navigation).toHaveAttribute("data-partner-breadcrumb-header");
  });
  it("uses an icon-only dashboard identity in a compact overflow container", () => {
    navigationState.pathname = "/cabinet";
    navigationState.query = "";
    render(<PartnerPageBreadcrumbs locale="ru" />);
    expect(screen.getByRole("link", { name: "Рабочий стол" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("list")).toHaveClass("min-w-0", "overflow-hidden");
  });
  it.each(["ru", "ro"] as const)("resolves section and subsection routes by semantic identity in %s", (locale) => {
    const breadcrumbs = resolvePartnerBreadcrumbs("/cabinet/quick-order", new URLSearchParams(), locale);
    expect(breadcrumbs.map((item) => item.href)).toEqual(["/cabinet", "/cabinet/catalog", "/cabinet/quick-order", "/cabinet/quick-order"]);
    const estimate = resolvePartnerBreadcrumbs("/cabinet/estimates/estimate-id", new URLSearchParams(), locale);
    expect(estimate.map((item) => item.href)).toEqual(["/cabinet", "/cabinet/estimates", "/cabinet/estimates", "/cabinet/estimates/estimate-id"]);
  });
  it.each(SUPPORTED_PARTNER_ROUTE_AREAS)("resolves navigable breadcrumbs for every implemented area: %s", (area) => {
    const breadcrumbs = resolvePartnerBreadcrumbs(`/cabinet/${area}`, new URLSearchParams(), "ru");
    expect(breadcrumbs[0]).toMatchObject({ iconKey: "dashboard", href: "/cabinet" });
    expect(breadcrumbs.every((item) => item.href.startsWith("/cabinet") && !item.href.includes("#"))).toBe(true);
    expect(breadcrumbs.some((item) => item.label === "Кабинет")).toBe(false);
  });
});

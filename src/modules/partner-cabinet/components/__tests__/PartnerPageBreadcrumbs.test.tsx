import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigationState = vi.hoisted(() => ({ pathname: "/cabinet/cart", filter: null as string | null }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
  useSearchParams: () => new URLSearchParams(navigationState.filter ? `filter=${navigationState.filter}` : ""),
}));

import { PartnerPageBreadcrumbs } from "../PartnerPageBreadcrumbs";

describe("PartnerPageBreadcrumbs", () => {
  beforeEach(() => {
    navigationState.pathname = "/cabinet/cart";
    navigationState.filter = null;
  });

  it("shows localized Cart context in the top-bar breadcrumb landmark", () => {
    render(<PartnerPageBreadcrumbs locale="ru" />);
    expect(screen.getByRole("navigation", { name: "Хлебные крошки" })).toHaveTextContent(/Оформление заказа\s*\/\s*Корзина/);
    expect(screen.getByText("Корзина")).toHaveAttribute("aria-current", "page");
  });

  it("shows the Favorites context for the saved-selection filter", () => {
    navigationState.pathname = "/cabinet/purchasing-lists";
    navigationState.filter = "favorites";
    render(<PartnerPageBreadcrumbs locale="ru" />);
    expect(screen.getByRole("navigation")).toHaveTextContent(/^Избранное$/);
  });

  it.each([
    ["ru", "/cabinet/purchasing-lists", null, "Мои комплекты"],
    ["ru", "/cabinet/compare", null, "Сравнение"],
    ["ro", "/cabinet/purchasing-lists", "favorites", "Favorite"],
    ["ro", "/cabinet/purchasing-lists", null, "Seturile mele"],
    ["ro", "/cabinet/compare", null, "Comparație"],
  ] as const)("uses a compact top-level identity for %s %s %s", (locale, pathname, filter, title) => {
    navigationState.pathname = pathname;
    navigationState.filter = filter;
    render(<PartnerPageBreadcrumbs locale={locale} />);
    const breadcrumb = screen.getByRole("navigation");
    expect(breadcrumb.textContent).toBe(title);
    expect(breadcrumb.querySelectorAll("li")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: title })).toHaveAttribute("aria-current", "page");
  });

  it("localizes checkout context for Romanian partners", () => {
    render(<PartnerPageBreadcrumbs locale="ro" />);
    expect(screen.getByRole("navigation", { name: "Navigare ierarhică" })).toHaveTextContent(/Finalizarea comenzii\s*\/\s*Coș/);
  });

  it.each([
    ["/cabinet/quick-order", "Подбор товаров"],
    ["/cabinet/opportunities", "Возможности для закупки"],
    ["/cabinet/offers", "Специальные предложения"],
  ])("shows purchasing context for %s", (route, title) => {
    navigationState.pathname = route;
    render(<PartnerPageBreadcrumbs locale="ru" />);
    expect(screen.getByRole("navigation")).toHaveTextContent("Покупки");
    expect(screen.getByRole("heading", { name: title })).toHaveAttribute("aria-current", "page");
  });

  it("does not render page context for routes without configured page headers", () => {
    navigationState.pathname = "/cabinet/catalog";
    const { container } = render(<PartnerPageBreadcrumbs locale="ru" />);
    expect(container).toBeEmptyDOMElement();
  });
});

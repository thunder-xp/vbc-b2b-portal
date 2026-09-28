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
    expect(screen.getByRole("navigation")).toHaveTextContent(/Подбор товаров\s*\/\s*Избранное/);
  });

  it("localizes checkout context for Romanian partners", () => {
    render(<PartnerPageBreadcrumbs locale="ro" />);
    expect(screen.getByRole("navigation", { name: "Navigare ierarhică" })).toHaveTextContent(/Finalizarea comenzii\s*\/\s*Coș/);
  });

  it("does not render page context for routes without configured page headers", () => {
    navigationState.pathname = "/cabinet/catalog";
    const { container } = render(<PartnerPageBreadcrumbs locale="ru" />);
    expect(container).toBeEmptyDOMElement();
  });
});

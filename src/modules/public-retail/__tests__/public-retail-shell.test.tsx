import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/modules/public-retail/components/PublicRetailCartBadge", () => ({
  PublicRetailCartBadge: ({ locale }: { locale: "ru" | "ro" }) => (
    <a aria-label={`${locale === "ro" ? "Coș" : "Корзина"}: 11`} href={`/cart?lang=${locale}`}>
      <span aria-hidden="true">cart-icon</span>
      <span>{locale === "ro" ? "Coș" : "Корзина"}</span>
      <span>11</span>
    </a>
  ),
}));

import { PublicRetailCartBadgeClient } from "../components/PublicRetailCartBadgeClient";
import { PublicRetailShell } from "../components/PublicRetailShell";

describe("Public Retail shell", () => {
  it("renders the exact desktop navigation and utility order", () => {
    render(<PublicRetailShell languagePath="/" locale="ru"><main>content</main></PublicRetailShell>);

    const navigation = within(screen.getByRole("navigation", { name: "Основная навигация" }));
    expect(navigation.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Каталог",
      "Решения",
      "Монтаж",
      "Доставка",
      "О компании",
      "Контакты",
    ]);
    expect(navigation.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/catalog?lang=ru",
      "/calculator/cctv?lang=ru",
      "/installation?lang=ru",
      "/?lang=ru#delivery",
      "/about?lang=ru",
      "/contacts?lang=ru",
    ]);

    const header = screen.getByRole("banner");
    const cabinet = within(header).getAllByRole("link", { name: "Кабинет партнёра" })[0];
    const cart = within(header).getByRole("link", { name: "Корзина: 11" });
    expect(cabinet).toHaveAttribute("href", "/cabinet");
    expect(cabinet.textContent).toBe("");
    expect(cabinet.compareDocumentPosition(cart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cart).toHaveTextContent("Корзина");
    expect(cart).toHaveTextContent("11");
    const brand = within(header).getByRole("link", { name: "Novotech Systems Distribution" });
    expect(within(header).getByRole("img", { name: "Novotech" })).toHaveAttribute("src", expect.stringContaining("novotech-logo-light-original"));
    expect(brand).toHaveTextContent("NOVOTECH SYSTEMS");
    expect(brand).toHaveTextContent("DISTRIBUTION");
    expect(within(header).queryByRole("search")).not.toBeInTheDocument();
    expect(within(header).queryByRole("searchbox")).not.toBeInTheDocument();
    expect(within(screen.getByRole("contentinfo")).getByRole("img", { name: "Novotech" })).toHaveAttribute("src", expect.stringContaining("novotech-logo-dark-original"));
    expect(screen.getByText("Прямой импортёр оборудования и решений для безопасности вашего дома и бизнеса.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Кишинёв, ул. Лев Толстой, 4" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Бельцы, ул. Думитру Карачобану, 118" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "0 79 31 33 53" })).toHaveAttribute("href", "tel:+37379313353");
    expect(screen.getByRole("heading", { name: "Информация" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Контакты" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Контакты и магазины" })).not.toBeInTheDocument();
  });

  it("keeps authored Romanian labels and complete mobile navigation", () => {
    render(<PublicRetailShell languagePath="/" locale="ro"><main>content</main></PublicRetailShell>);

    const mobile = within(screen.getByRole("navigation", { name: "Navigare mobilă" }));
    expect(mobile.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Catalog",
      "Soluții",
      "Instalare",
      "Livrare",
      "Despre noi",
      "Contacte",
      "RU",
      "RO",
    ]);
    expect(mobile.getByRole("link", { name: "Catalog" })).toHaveAttribute("href", "/catalog?lang=ro");
    expect(within(screen.getByRole("banner")).queryByRole("search")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Cabinet partener" })[0]).toHaveAttribute("aria-label", "Cabinet partener");
    expect(screen.getByRole("link", { name: "Coș: 11" })).toHaveAttribute("href", "/cart?lang=ro");
    expect(screen.getByRole("heading", { name: "Informații" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Contacte" })).toBeInTheDocument();
  });

  it("renders the real cart utility as an icon-and-label button with its bounded count", () => {
    render(<PublicRetailCartBadgeClient initialQuantity={125} locale="ru" />);

    const cart = screen.getByRole("link", { name: "Корзина: 125" });
    expect(cart).toHaveAttribute("href", "/cart?lang=ru");
    expect(cart).toHaveTextContent("Корзина");
    expect(cart).toHaveTextContent("99+");
    expect(cart).toHaveClass("min-h-11", "border");
  });
});

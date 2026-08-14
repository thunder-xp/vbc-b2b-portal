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
      "Подобрать систему",
      "Услуги и монтаж",
      "Доставка",
      "Поддержка",
      "Наши партнёры",
    ]);
    expect(navigation.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/catalog?lang=ru",
      "/calculator/cctv?lang=ru",
      "/?lang=ru#installation",
      "/?lang=ru#delivery",
      "/?lang=ru#support",
      "/partners?lang=ru",
    ]);

    const header = screen.getByRole("banner");
    const cabinet = within(header).getAllByRole("link", { name: "Кабинет партнёра" })[0];
    const cart = within(header).getByRole("link", { name: "Корзина: 11" });
    expect(cabinet).toHaveAttribute("href", "/cabinet");
    expect(cabinet.textContent).toBe("");
    expect(cabinet.compareDocumentPosition(cart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cart).toHaveTextContent("Корзина");
    expect(cart).toHaveTextContent("11");
    expect(within(header).getByRole("link", { name: "Novotech Systems Distribution" })).toHaveTextContent("NOVOTECH SYSTEMS");
    expect(within(header).getByText("DISTRIBUTION")).toBeInTheDocument();
  });

  it("keeps authored Romanian labels and complete mobile navigation", () => {
    render(<PublicRetailShell languagePath="/" locale="ro"><main>content</main></PublicRetailShell>);

    const mobile = within(screen.getByRole("navigation", { name: "Мобильная навигация" }));
    expect(mobile.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Catalog",
      "Alege un sistem",
      "Servicii și instalare",
      "Livrare",
      "Suport",
      "Partenerii noștri",
      "Cabinet partener",
      "RU",
      "RO",
    ]);
    expect(screen.getAllByRole("link", { name: "Cabinet partener" })[0]).toHaveAttribute("aria-label", "Cabinet partener");
    expect(screen.getByRole("link", { name: "Coș: 11" })).toHaveAttribute("href", "/cart?lang=ro");
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

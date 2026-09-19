import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, waitFor, within } from "@testing-library/react";
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
      "Кабинет партнёра",
    ]);
    expect(navigation.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/catalog?lang=ru",
      "/calculator/cctv?lang=ru",
      "/installation?lang=ru",
      "/?lang=ru#delivery",
      "/about?lang=ru",
      "/contacts?lang=ru",
      "/cabinet",
    ]);

    const header = screen.getByRole("banner");
    const account = within(header).getByRole("link", { name: "Личный кабинет" });
    const language = within(header).getByRole("link", { name: "Переключить на румынский" });
    const cart = within(header).getByRole("link", { name: "Корзина: 11" });
    expect(account).toHaveAttribute("href", "/account?lang=ru");
    expect(account.textContent).toBe("");
    expect(account.compareDocumentPosition(language) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(language).toHaveTextContent("RO");
    expect(language.compareDocumentPosition(cart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cart).toHaveTextContent("Корзина");
    expect(cart).toHaveTextContent("11");
    const brand = within(header).getByRole("link", { name: "NovotechNOVOTECH SYSTEMSDISTRIBUTION" });
    expect(within(header).getByRole("img", { name: "Novotech" })).toHaveAttribute("src", expect.stringContaining("novotech-logo-light-original"));
    expect(brand).toHaveTextContent("NOVOTECH SYSTEMS");
    expect(brand).toHaveTextContent("DISTRIBUTION");
    expect(within(header).queryByRole("search")).not.toBeInTheDocument();
    expect(within(header).queryByRole("searchbox")).not.toBeInTheDocument();
    expect(within(screen.getByRole("contentinfo")).getByRole("img", { name: "Novotech" })).toHaveAttribute("src", expect.stringContaining("novotech-logo-dark-original"));
    expect(screen.getByText("Прямой импортер оборудования и решений.")).toBeInTheDocument();
    expect(within(screen.getByRole("contentinfo")).getByText("NOVOTECH SYSTEMS")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Кишинёв, ул. Лев Толстой, 4" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Бельцы, ул. Думитру Карачобану, 118" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "0 79 31 33 53" })).toHaveAttribute("href", "tel:+37379313353");
    expect(screen.getByRole("heading", { name: "Информация" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Контакты" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Контакты и магазины" })).not.toBeInTheDocument();
    const payments = within(screen.getByRole("group", { name: "Поддерживаемые платёжные системы" }));
    for (const name of ["MAIB", "Visa", "Mastercard", "American Express"]) expect(payments.getByRole("img", { name })).toBeInTheDocument();
    expect(screen.getByText("NOVOTECH SYSTEMS S.R.L.")).toBeInTheDocument();
    expect(screen.getByText("IDNO: 1018600013048")).toBeInTheDocument();
    expect(screen.getByText("TVA: 0209950")).toBeInTheDocument();
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
      "Cabinet partener",
    ]);
    expect(mobile.getByRole("link", { name: "Catalog" })).toHaveAttribute("href", "/catalog?lang=ro");
    expect(within(screen.getByRole("banner")).queryByRole("search")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cont personal" })).toHaveAttribute("href", "/account?lang=ro");
    expect(mobile.getByRole("link", { name: "Cabinet partener" })).toHaveAttribute("href", "/cabinet");
    expect(screen.getByRole("link", { name: "Coș: 11" })).toHaveAttribute("href", "/cart?lang=ro");
    expect(screen.getByRole("heading", { name: "Informații" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Contacte" })).toBeInTheDocument();
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "Comută în limba rusă" })).toHaveTextContent("RU");
    expect(screen.getByText("MD-2001, mun. Chișinău, str. Mihail Kogălniceanu 9, of. 17")).toBeInTheDocument();
  });

  it("renders the real cart utility as an icon-and-label button with its bounded count", () => {
    render(<PublicRetailCartBadgeClient initialQuantity={125} locale="ru" />);

    const cart = screen.getByRole("link", { name: "Корзина: 125" });
    expect(cart).toHaveAttribute("href", "/cart?lang=ru");
    expect(cart).toHaveTextContent("Корзина");
    expect(cart).toHaveTextContent("99+");
    expect(cart).toHaveClass("min-h-11", "border");
  });

  it("loads private cart quantity separately for a cacheable public catalog shell", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      distinctItemCount: 2,
      totalQuantity: 7,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    render(<PublicRetailCartBadgeClient deferSummary initialQuantity={0} locale="ru" />);

    await waitFor(() => expect(screen.getByRole("link", { name: /: 7$/ })).toBeInTheDocument());
    expect(request).toHaveBeenCalledWith("/api/public-retail/cart-summary", expect.objectContaining({
      cache: "no-store",
      credentials: "same-origin",
    }));
    request.mockRestore();
  });

  it("keeps public-shell contrast and prefetch policy explicit", () => {
    const shell = readFileSync(join(process.cwd(), "src/modules/public-retail/components/PublicRetailShell.tsx"), "utf8");
    const cart = readFileSync(join(process.cwd(), "src/modules/public-retail/components/PublicRetailCartBadgeClient.tsx"), "utf8");

    expect(shell).toContain('text-xs leading-4 text-zinc-400');
    expect(shell).toContain('border-t border-zinc-800 px-4 py-4');
    expect(shell).toContain('inline-flex min-h-11 w-fit items-center hover:text-white lg:min-h-8');
    expect(shell).toContain('gap-y-6 px-4 py-7');
    expect(shell).toContain('lg:gap-y-5 lg:px-8 lg:py-6');
    expect(shell).toContain('mt-3 grid gap-0 text-sm leading-snug');
    expect(shell).not.toMatch(/<footer[^>]*\bh-(?:screen|full|\[)/);
    expect(shell).not.toContain('text-xs leading-5 text-zinc-500');
    expect(shell).toContain('[copy.partnerCabinet, "/cabinet", false]');
    expect(shell).toContain('href={`/account?lang=${locale}`} prefetch={false}');
    expect(shell).toContain('href={href} prefetch={false}');
    expect(shell).toContain('prefetch={prefetch ? undefined : false}');
    expect(cart).toContain('prefetch={quantity > 0 ? undefined : false}');
  });
});

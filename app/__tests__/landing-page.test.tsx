import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicRetailCategoryDto } from "@/src/modules/public-retail";

const mocks = vi.hoisted(() => ({ listRetailCategories: vi.fn() }));

vi.mock("@/src/modules/public-retail/server", () => ({
  getPublicRetailService: () => ({ listRetailCategories: mocks.listRetailCategories }),
}));
vi.mock("@/src/modules/public-retail/components/PublicRetailCartBadge", () => ({
  PublicRetailCartBadge: () => <a href="/cart">Cart</a>,
}));

import Home from "../page";

const categories: PublicRetailCategoryDto[] = [
  ["catalog-item-772c9d50", "Видеонаблюдение", 186],
  ["catalog-item-f5379005", "Охранные системы", 90],
  ["catalog-item-fe802fd7", "Контроль доступа", 65],
].map(([slug, name, count], index) => ({ id: `10000000-0000-4000-8000-00000000000${index}`, parentId: null, slug: String(slug), name: String(name), description: null, productCount: Number(count) }));

describe("public retail landing", () => {
  beforeEach(() => mocks.listRetailCategories.mockResolvedValue(categories));

  it("leads with system selection and routes the hero catalog action to the showcase", async () => {
    render(await Home({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Системы безопасности под ключ" })).toBeInTheDocument();
    expect(screen.queryByText(/NOVOTECH SECURITY SYSTEMS/i)).not.toBeInTheDocument();
    const heroPrimary = screen.getAllByRole("link", { name: /Подобрать систему/ }).find((link) => link.classList.contains("bg-emerald-600"));
    const heroCatalog = screen.getByRole("link", { name: "Перейти в каталог" });
    if (!heroPrimary) throw new Error("Primary system-selection action is missing.");
    expect(heroPrimary).toHaveAttribute("href", "/calculator/cctv?lang=ru");
    expect(heroCatalog).toHaveAttribute("href", "/catalog?lang=ru");
    expect(heroPrimary.compareDocumentPosition(heroCatalog) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: "Открыть каталог" })).toHaveAttribute("href", "/catalog?lang=ru&view=all");
    expect(screen.getAllByRole("link", { name: "Контакты" })[0]).toHaveAttribute("href", "/contacts?lang=ru");
    expect(screen.getAllByText("Прямой импортёр оборудования и решений для безопасности").length).toBeGreaterThan(0);
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    expect(screen.queryByText("Партнёрская платформа Novotech")).not.toBeInTheDocument();
    expect(screen.queryByText("Стать партнёром")).not.toBeInTheDocument();
  });

  it("renders object discovery and only governed category tiles", async () => {
    render(await Home({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Что вам нужно защитить?" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Квартира/ })).toHaveAttribute("href", expect.stringContaining("object=apartment"));
    expect(screen.getByRole("heading", { name: "Видеонаблюдение" })).toBeInTheDocument();
    expect(screen.queryByText("-PROJECT EQUIPMENT-")).not.toBeInTheDocument();
  });

  it("renders authored Romanian chrome while catalog data may fall back deterministically", async () => {
    render(await Home({ searchParams: Promise.resolve({ lang: "ro" }) }));

    expect(screen.getByRole("heading", { name: "Sisteme de securitate complete" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ce doriți să protejați?" })).toBeInTheDocument();
    expect(mocks.listRetailCategories).toHaveBeenCalledWith("ro");
  });
});

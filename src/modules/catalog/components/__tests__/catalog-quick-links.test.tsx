import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { resolveCatalogQuickLinks, type CatalogCategoryDto, type CatalogRouteState } from "../../services";
import { CatalogQuickLinks } from "../CatalogQuickLinks";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/cabinet/catalog",
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams("view=all&search=dahua&page=4"),
}));

const categories: CatalogCategoryDto[] = [
  category("video", "772c9d50-3298-11e9-a216-000c29411cbe", "Видеонаблюдение"),
  category("access", "fe802fd7-c941-11e8-80eb-000c29a58b59", "Контроль доступа"),
  category("security", "f5379005-2857-11e9-80ed-000c29a58b59", "Охранные системы"),
  category("fire", "b6b833a8-c5fb-11ec-049f-7239d3b7bd5c", "Пожарные системы"),
  category("audio", "772c9d4d-3298-11e9-a216-000c29411cbe", "Оповещение и трансляция"),
  category("network", "eedee611-3218-11e9-a216-000c29411cbe", "Сетевое оборудование"),
  category("servers", "9ad481a2-99c1-11e9-804d-000c2988d323", "Серверное оборудование"),
  category("intercom", "772c9d4b-3298-11e9-a216-000c29411cbe", "Домофония"),
  category("storage", "3b8d3fa9-6457-11e8-80d2-000c29a58b59", "Хранение данных"),
  category("software", "72474ac1-e0fc-11e9-920e-000c29cf9dd4", "Программное обеспечение"),
  category("monitors", "0779591b-9b16-11e8-80e6-000c29a58b59", "Мониторы и дисплеи"),
  category("accessories", "f5379003-2857-11e9-80ed-000c29a58b59", "Аксессуары"),
  category("cable", "f5379001-2857-11e9-80ed-000c29a58b59", "Кабельные материалы"),
  category("power", "eedee60b-3218-11e9-a216-000c29411cbe", "Электропитание"),
  category("unrelated", "11111111-1111-4111-8111-111111111111", "Видеонаблюдение"),
];

describe("CatalogQuickLinks", () => {
  it("renders every required shortcut from exact governed 1C identities", () => {
    render(<CatalogQuickLinks categories={categories} locale="ru" state={routeState()} />);
    for (const label of ["ВИДЕО", "СКУД", "ОПС", "ЗВУК", "СЕТЬ", "ДОМОФОН", "IT", "МАТЕРИАЛЫ", "ПИТАНИЕ"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByTestId("catalog-quick-links").querySelector("nav")).toHaveClass("overflow-x-auto");
    expect(screen.getByRole("button", { name: "ВИДЕО" })).toHaveClass("min-h-11", "px-3");
  });

  it("resolves multi-group shortcuts deterministically and excludes lookalike categories", () => {
    const links = resolveCatalogQuickLinks(categories, "ru");
    expect(links.find((link) => link.code === "security")?.categoryIds).toEqual(["security", "fire"]);
    expect(links.find((link) => link.code === "network")?.categoryIds).toEqual(["network", "servers"]);
    expect(links.find((link) => link.code === "it")?.categoryIds).toEqual(["storage", "software", "monitors"]);
    expect(links.find((link) => link.code === "video")?.categoryIds).toEqual(["video"]);
    expect(links.flatMap((link) => link.categoryIds)).not.toContain("unrelated");
  });

  it("keeps compatible catalog state, resets paging, and marks the active shortcut", () => {
    render(<CatalogQuickLinks categories={categories} locale="ru" state={routeState({ categoryIds: ["security", "fire"], page: 4, search: "dahua", sort: "price_desc" })} />);
    const button = screen.getByRole("button", { name: "ОПС" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "СКУД" }));
    expect(push).toHaveBeenCalledWith(expect.stringContaining("categories="));
    expect(push).toHaveBeenCalledWith(expect.stringContaining("search=dahua"));
  });
});

function category(id: string, external1cId: string, name: string): CatalogCategoryDto {
  return { id, external1cId, parentId: null, name, slug: id, description: null };
}
function routeState(overrides: Partial<CatalogRouteState> = {}): CatalogRouteState {
  return {
    attributeFilters: {},
    availability: "all",
    categoryIds: [],
    explicitAll: false,
    mode: "discovery",
    page: 1,
    sort: "default",
    ...overrides,
  };
}

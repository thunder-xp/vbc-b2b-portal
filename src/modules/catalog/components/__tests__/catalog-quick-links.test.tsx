import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { resolveCatalogQuickLinks, type CatalogCategoryDto, type CatalogRouteState } from "../../services";
import { CatalogQuickLinks } from "../CatalogQuickLinks";

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
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByTestId("catalog-quick-links")).toHaveClass("overflow-x-auto");
    expect(screen.getByRole("link", { name: "ВИДЕО" })).toHaveClass("h-9", "px-3", "text-xs");
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
    render(<CatalogQuickLinks categories={categories} locale="ru" state={routeState({ categorySet: "security", page: 4, search: "dahua", sort: "price_desc" })} />);
    const link = screen.getByRole("link", { name: "ОПС" });
    const url = new URL(link.getAttribute("href")!, "https://portal.test");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(url.searchParams.get("categorySet")).toBe("security");
    expect(url.searchParams.get("search")).toBe("dahua");
    expect(url.searchParams.get("sort")).toBe("price_desc");
    expect(url.searchParams.has("page")).toBe(false);
    expect(url.searchParams.has("category")).toBe(false);
  });
});

function category(id: string, external1cId: string, name: string): CatalogCategoryDto {
  return { id, external1cId, parentId: null, name, slug: id, description: null };
}
function routeState(overrides: Partial<CatalogRouteState> = {}): CatalogRouteState {
  return {
    attributeFilters: {},
    availability: "all",
    explicitAll: false,
    mode: "discovery",
    page: 1,
    sort: "default",
    ...overrides,
  };
}

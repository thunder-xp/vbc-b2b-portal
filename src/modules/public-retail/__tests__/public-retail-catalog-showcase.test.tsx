import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PublicRetailShowcase } from "../components/PublicRetailShowcase";
import { publicRetailFullCatalogHref, publicRetailShowcaseHref } from "../presentation";
import { parsePublicRetailShowcase } from "../validation";
import type { PublicRetailProductSummaryDto } from "../types";

const product: PublicRetailProductSummaryDto = {
  id: "10000000-0000-4000-8000-000000000001",
  slug: "camera-model-1",
  sku: "CAM-001",
  name: "Камера Model 1",
  shortDescription: "Камера",
  image: null,
  brand: { slug: "brand", name: "Brand" },
  category: { slug: "video", name: "Видеонаблюдение" },
  price: { amount: 1299, currency: "MDL", vatPresentation: "not_specified" },
  availability: "in_stock",
  highlights: [],
  calculatorEligible: false,
};

describe("Public Retail catalog showcase", () => {
  it("renders the three governed sections in order with exact listing links", () => {
    render(<PublicRetailShowcase locale="ru" showcase={{ popular: [product], new: [product], hot: [product] }} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Популярные товары", "Новинки", "Горячая цена",
    ]);
    expect(screen.getAllByRole("link", { name: /Показать все/ }).map((link) => link.getAttribute("href"))).toEqual([
      "/catalog?lang=ru&view=popular", "/catalog?lang=ru&view=new", "/catalog?lang=ru&view=hot",
    ]);
    expect(screen.getByText("Популярный")).toBeInTheDocument();
    expect(screen.getByText("Новинка")).toBeInTheDocument();
    expect(screen.getAllByText("Горячая цена")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Каталог" })).toHaveAttribute("href", "/catalog?lang=ru&view=all");
    expect(screen.getByText("Популярный")).toHaveClass("text-emerald-800");
    expect(screen.getByText("Новинка")).toHaveClass("text-sky-800");
    expect(screen.getAllByText("Горячая цена")[1]).toHaveClass("text-rose-800");
  });

  it("localizes section-derived merchandising badges in Romanian", () => {
    render(<PublicRetailShowcase locale="ro" showcase={{ popular: [product], new: [product], hot: [product] }} />);
    expect(screen.getByText("Popular")).toBeInTheDocument();
    expect(screen.getByText("Noutate")).toBeInTheDocument();
    expect(screen.getAllByText("Preț special")).toHaveLength(2);
  });

  it("keeps an empty governed section visible without fabricating products", () => {
    render(<PublicRetailShowcase locale="ru" showcase={{ popular: [], new: [], hot: [] }} />);
    expect(screen.getAllByText("В этой подборке пока нет товаров.")).toHaveLength(3);
  });

  it("rejects more than five products in any showcase section", () => {
    expect(() => parsePublicRetailShowcase({ popular: Array(6).fill(product), new: [], hot: [] })).toThrow();
  });

  it("uses one bounded aggregate over governed TOP, NEW and HOT labels", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260813125443_public_retail_catalog_showcase_layout.sql"), "utf8");
    expect(sql).toContain("create or replace function public.get_public_retail_showcase");
    expect(sql).toContain("'popular', 5, 0");
    expect(sql).toContain("'new', 5, 0");
    expect(sql).toContain("'HOT' = any(product.merchandising_labels)");
    expect(sql).toContain("public.list_public_retail_hot_products(p_locale, 5, 0)");
    expect(sql).not.toContain("catalog_products");
    expect(sql).not.toContain("catalog_prices");
  });

  it("routes only a query-free catalog request to the showcase", () => {
    const page = readFileSync(join(process.cwd(), "app/catalog/page.tsx"), "utf8");
    expect(page).toContain("if (!hasListingIntent(params))");
    expect(page).toContain("key.startsWith(\"facet_\")");
    expect(page).toContain("view === \"hot\" ? \"hot\"");
    expect(publicRetailFullCatalogHref("ru")).toBe("/catalog?lang=ru&view=all");
    expect(publicRetailFullCatalogHref("ro")).toBe("/catalog?lang=ro&view=all");
    expect(publicRetailShowcaseHref("ru")).toBe("/catalog?lang=ru");
    expect(publicRetailShowcaseHref("ro")).toBe("/catalog?lang=ro");
  });
});

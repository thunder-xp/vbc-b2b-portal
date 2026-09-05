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
const categories = [{ id: "20000000-0000-4000-8000-000000000001", parentId: null, slug: "video", name: "Видеонаблюдение", description: null, productCount: 12 }];
const totalCounts = { popular: 1, new: 1, hot: 1, replenishment: 1 };

describe("Public Retail catalog showcase", () => {
  it("renders the governed sections in order with exact listing links", () => {
    render(<PublicRetailShowcase categories={categories} locale="ru" showcase={{ popular: [product], new: [product], hot: [product], replenishment: [product], totalCounts }} />);
    expect(screen.getByRole("heading", { level: 1, name: "Витрина" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Популярные товары", "Новинки", "Горячая цена", "Последнее поступление",
    ]);
    expect(screen.getAllByRole("link", { name: /Показать все/ }).map((link) => link.getAttribute("href"))).toEqual([
      "/catalog?lang=ru&view=popular", "/catalog?lang=ru&view=new", "/catalog?lang=ru&view=hot", "/catalog?lang=ru&view=replenishment",
    ]);
    expect(screen.getByText("Популярное")).toBeInTheDocument();
    expect(getMerchandisingBadge("Новинки")).toBeInTheDocument();
    expect(screen.getAllByText("Горячая цена")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Оборудование" })).toHaveAttribute("href", "/catalog?lang=ru&view=all");
    expect(screen.getByText("Популярное")).toHaveClass("text-amber-900");
    expect(getMerchandisingBadge("Новинки")).toHaveClass("text-sky-800");
    expect(screen.getAllByText("Горячая цена")[1]).toHaveClass("text-rose-800");
    expect(screen.getByText("Пополнение")).toHaveClass("border-emerald-700", "bg-emerald-50", "text-emerald-900", "rounded-sm", "text-[11px]");
  });

  it("localizes section-derived merchandising badges in Romanian", () => {
    render(<PublicRetailShowcase categories={categories} locale="ro" showcase={{ popular: [product], new: [product], hot: [product], replenishment: [product], totalCounts }} />);
    expect(screen.getByText("Popular")).toBeInTheDocument();
    expect(screen.getByText("Noutate")).toBeInTheDocument();
    expect(screen.getAllByText("Preț special")).toHaveLength(2);
  });

  it("keeps an empty governed section visible without fabricating products", () => {
    render(<PublicRetailShowcase categories={categories} locale="ru" showcase={{ popular: [], new: [], hot: [], replenishment: [], totalCounts: { popular: 0, new: 0, hot: 0, replenishment: 0 } }} />);
    expect(screen.getAllByText("В этой подборке пока нет товаров.")).toHaveLength(4);
  });

  it("rejects more than five products in any showcase section", () => {
    expect(() => parsePublicRetailShowcase({ popular: Array(6).fill(product), new: [], hot: [], replenishment: [], totalCounts })).toThrow();
  });

  it("renders only the first five products and reports the exact hidden total", () => {
    const products = Array.from({ length: 8 }, (_, index) => ({
      ...product,
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      slug: `camera-model-${index + 1}`,
      sku: `CAM-${String(index + 1).padStart(3, "0")}`,
      name: `Камера Model ${index + 1}`,
    }));
    render(<PublicRetailShowcase categories={categories} locale="ru" showcase={{ popular: products, new: [], hot: [], replenishment: [], totalCounts: { popular: 8, new: 0, hot: 0, replenishment: 0 } }} />);

    expect(screen.getByLabelText("Ещё 3 товара")).toHaveTextContent("3");
    expect(screen.getByRole("link", { name: "Камера Model 5" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Камера Model 6" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Показать все/ }).find((link) => link.getAttribute("href") === "/catalog?lang=ru&view=popular")).toBeInTheDocument();
  });

  it("does not render a remaining-item badge when the collection has five products", () => {
    render(<PublicRetailShowcase categories={categories} locale="ru" showcase={{ popular: Array(5).fill(product), new: [], hot: [], replenishment: [], totalCounts: { popular: 5, new: 0, hot: 0, replenishment: 0 } }} />);
    expect(screen.queryByLabelText(/Ещё/)).not.toBeInTheDocument();
  });

  it("preserves strict non-negative collection totals in the aggregate contract", () => {
    expect(parsePublicRetailShowcase({ popular: [product], new: [], hot: [], replenishment: [], totalCounts: { popular: 8, new: 0, hot: 0, replenishment: 0 } }).totalCounts.popular).toBe(8);
    expect(() => parsePublicRetailShowcase({ popular: [], new: [], hot: [], replenishment: [], totalCounts: { popular: -1, new: 0, hot: 0, replenishment: 0 } })).toThrow();
  });

  it("keeps the existing RPC response usable during zero-downtime deployment ordering", () => {
    expect(parsePublicRetailShowcase({ popular: [product], new: [], hot: [], replenishment: [] }).totalCounts).toEqual({ popular: 1, new: 0, hot: 0, replenishment: 0 });
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

  it("preserves all four existing list totals in the same hardened RPC", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260905143226_preserve_public_retail_showcase_totals.sql"), "utf8");
    expect(sql).toContain("create or replace function public.get_public_retail_showcase_v2");
    expect(sql).toContain("'totalCounts', jsonb_build_object(");
    expect(sql).toContain("'popular', coalesce((popular->>'totalCount')::integer, 0)");
    expect(sql).toContain("'replenishment', coalesce((replenishment->>'totalCount')::integer, 0)");
    expect(sql.match(/:= public\.list_public_retail_/g)).toHaveLength(4);
    expect(sql).not.toContain("base_showcase");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("revoke all on function public.get_public_retail_showcase_v2(text)");
    expect(sql).toContain("grant execute on function public.get_public_retail_showcase_v2(text)");
    expect(sql).toContain("to anon, authenticated");
  });

  it("uses an explicit public-only five-column contract at the proven 1366px breakpoint", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const presentation = readFileSync(join(process.cwd(), "src/modules/catalog/components/CatalogPresentationPrimitives.tsx"), "utf8");
    const catalog = readFileSync(join(process.cwd(), "src/modules/public-retail/components/PublicRetailCatalog.tsx"), "utf8");
    const card = readFileSync(join(process.cwd(), "src/modules/public-retail/components/PublicRetailProductCard.tsx"), "utf8");

    expect(css).toContain("@media (min-width: 1366px)");
    expect(css).toContain("grid-template-columns: repeat(5, minmax(0, 1fr))");
    expect(presentation).toContain('"public-retail-product-grid grid min-w-0 gap-3"');
    expect(catalog).toContain("gap-5 lg:grid-cols-[240px_minmax(0,1fr)]");
    expect(catalog).toContain('layout="public-retail"');
    expect(card).toContain('className="w-full min-w-0"');
    expect(card).toContain("[overflow-wrap:anywhere]");
    expect(css).not.toContain("auto-fit");
    expect(css).not.toContain("auto-fill");
  });

  it("routes only a query-free catalog request to the showcase", () => {
    const page = readFileSync(join(process.cwd(), "app/catalog/page.tsx"), "utf8");
    expect(page).toContain("if (!hasListingIntent(params))");
    expect(page).toContain("key.startsWith(\"attr.\")");
    expect(page).toContain('view === "special" ? "special"');
    expect(page).toContain("view === \"hot\" ? \"hot\"");
    expect(publicRetailFullCatalogHref("ru")).toBe("/catalog?lang=ru&view=all");
    expect(publicRetailFullCatalogHref("ro")).toBe("/catalog?lang=ro&view=all");
    expect(publicRetailShowcaseHref("ru")).toBe("/catalog?lang=ru");
    expect(publicRetailShowcaseHref("ro")).toBe("/catalog?lang=ro");
  });
});

function getMerchandisingBadge(label: string): HTMLElement {
  const badge = screen.getAllByText(label).find((element) => element.tagName === "SPAN");
  if (!badge) {
    throw new Error(`Merchandising badge not found: ${label}`);
  }
  return badge;
}

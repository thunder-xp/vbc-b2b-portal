import { ArrowRight, LayoutGrid } from "lucide-react";
import Link from "next/link";

import { publicRetailFullCatalogHref, publicRetailMerchandisingBadge, publicRetailVisibleCategories, retailCopy } from "../presentation";
import type { PublicRetailMerchandisingMode } from "../types";
import type { PublicRetailCategoryDto, PublicRetailLocale, PublicRetailProductSummaryDto, PublicRetailShowcaseDto } from "../types";
import { PublicRetailProductCard } from "./PublicRetailProductCard";
import { PublicRetailCategoryMenu } from "./PublicRetailCategoryMenu";
import { CatalogProductGridFrame, CatalogResultsHeader, CatalogToolbarFrame } from "../../catalog/components/CatalogPresentationPrimitives";
import { PublicRetailSearchForm } from "./PublicRetailSearchForm";
import { RollingPeriodSelector, type RollingPeriod, type RollingPeriodState } from "../../commerce-period";

export function PublicRetailShowcase({ categories, locale, periods = { popular: null, new: null, hot: null }, showcase }: { categories: PublicRetailCategoryDto[]; locale: PublicRetailLocale; periods?: { popular: RollingPeriodState; new: RollingPeriodState; hot: RollingPeriodState }; showcase: PublicRetailShowcaseDto }) {
  const copy = retailCopy[locale];
  return <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
    <CatalogResultsHeader eyebrow="Novotech Retail" eyebrowTone="retail" title={copy.showcase} />
    <div className="mt-5"><CatalogToolbarFrame>
        <PublicRetailCategoryMenu categories={publicRetailVisibleCategories(categories).map((category) => ({ id: category.id, name: category.name, parentId: category.parentId, slug: category.slug }))} locale={locale} />
        <PublicRetailSearchForm id="showcase" locale={locale} />
        <Link className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 border border-zinc-300 px-4 text-sm font-semibold hover:border-blue-700 hover:text-blue-800" href={publicRetailFullCatalogHref(locale)}><LayoutGrid aria-hidden="true" className="size-4" />{locale === "ro" ? "Echipamente" : "Оборудование"}</Link>
    </CatalogToolbarFrame></div>
    <div className="divide-y divide-zinc-200">
      <ShowcaseSection href={fullSelectionHref(locale, "popular", periods.popular)} locale={locale} mode="popular" period={periods.popular} periods={periods} products={showcase.popular} title={copy.popularProducts} totalCount={showcase.totalCounts.popular} />
      <ShowcaseSection href={fullSelectionHref(locale, "new", periods.new)} locale={locale} mode="new" period={periods.new} periods={periods} products={showcase.new} title={copy.newProducts} totalCount={showcase.totalCounts.new} />
      <ShowcaseSection href={fullSelectionHref(locale, "hot", periods.hot)} locale={locale} mode="hot" period={periods.hot} periods={periods} products={showcase.hot} title={copy.hotPrice} totalCount={showcase.totalCounts.hot} />
      <ShowcaseSection href={`/catalog?lang=${locale}&view=replenishment`} locale={locale} mode="replenishment" products={showcase.replenishment} title={copy.replenishmentCollection} totalCount={showcase.totalCounts.replenishment} />
    </div>
  </div>;
}

function ShowcaseSection({ href, locale, mode, period, periods, products, title, totalCount }: { href: string; locale: PublicRetailLocale; mode: PublicRetailMerchandisingMode; period?: RollingPeriodState; periods?: { popular: RollingPeriodState; new: RollingPeriodState; hot: RollingPeriodState }; products: PublicRetailProductSummaryDto[]; title: string; totalCount: number }) {
  const copy = retailCopy[locale];
  const badge = publicRetailMerchandisingBadge(locale, mode);
  const visibleProducts = products.slice(0, 5);
  const hiddenCount = Math.max(totalCount - 5, 0);
  return <section className="py-5" aria-labelledby={`showcase-${mode}`} data-hidden-count={hiddenCount}>
    <div className="mb-3 flex items-center justify-between gap-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3"><h2 className="text-xl font-semibold" id={`showcase-${mode}`}>{title}</h2>{(mode === "popular" || mode === "new" || mode === "hot") && periods ? <RollingPeriodSelector activePeriod={period ?? null} hrefForPeriod={(target) => showcasePeriodHref(locale, periods, mode, target)} locale={locale} tone="retail" /> : null}</div>
      <div className="inline-flex shrink-0 items-center gap-2">
        {hiddenCount > 0 ? <span aria-label={remainingProductsLabel(locale, hiddenCount)} className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-blue-700 px-1.5 text-[11px] font-bold tabular-nums text-white">{hiddenCount}</span> : null}
        <Link className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-blue-800 hover:text-blue-950" href={href}>{copy.showAll}<ArrowRight aria-hidden="true" className="size-4" /></Link>
      </div>
    </div>
    {visibleProducts.length ? <CatalogProductGridFrame layout="public-retail">{visibleProducts.map((product) => <PublicRetailProductCard badge={badge.label} badgeVariant={badge.variant} key={product.id} locale={locale} product={product} />)}</CatalogProductGridFrame> : <p className="border border-dashed border-zinc-300 px-6 py-10 text-center text-sm text-zinc-600">{copy.emptyShowcase}</p>}
  </section>;
}

function showcasePeriodHref(locale: PublicRetailLocale, states: { popular: RollingPeriodState; new: RollingPeriodState; hot: RollingPeriodState }, key: "popular" | "new" | "hot", target: RollingPeriod): string {
  const query = new URLSearchParams({ lang: locale });
  const popular = key === "popular" ? target : states.popular;
  const fresh = key === "new" ? target : states.new;
  const hot = key === "hot" ? target : states.hot;
  if (popular) query.set("period", String(popular));
  if (fresh) query.set("newPeriod", String(fresh));
  if (hot) query.set("hotPeriod", String(hot));
  return `/catalog?${query}`;
}

function fullSelectionHref(locale: PublicRetailLocale, mode: "popular" | "new" | "hot", state: RollingPeriodState): string {
  const query = new URLSearchParams({ lang: locale, view: mode });
  if (state) query.set("period", String(state));
  return `/catalog?${query}`;
}

function remainingProductsLabel(locale: PublicRetailLocale, count: number): string {
  if (locale === "ro") return count === 1 ? "Încă un produs" : `Încă ${count} produse`;
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  const noun = remainder100 >= 11 && remainder100 <= 14
    ? "товаров"
    : remainder10 === 1
      ? "товар"
      : remainder10 >= 2 && remainder10 <= 4
        ? "товара"
        : "товаров";
  return `Ещё ${count} ${noun}`;
}

import { Check, Menu, Sparkles } from "lucide-react";
import Link from "next/link";

import { CatalogFilterGroup, CatalogFilterPanel } from "../../catalog/components/CatalogFilterPanel";
import { CatalogFilterLink } from "../../catalog/components/CatalogFilterLink";
import { CatalogFilterShell } from "../../catalog/components/CatalogFilterShell";
import { EmptyCatalog } from "../../catalog/components/EmptyCatalog";
import { CatalogProductGridFrame, CatalogResultsHeader, CatalogToolbarFrame } from "../../catalog/components/CatalogPresentationPrimitives";
import { NumberedPagination } from "../../platform-ui";
import { publicRetailShowcaseHref, retailCopy } from "../presentation";
import type { PublicRetailAvailability, PublicRetailCatalogMode, PublicRetailCategoryDto, PublicRetailFacetDto, PublicRetailLocale, PublicRetailProductPageDto } from "../types";
import { PublicRetailProductCard } from "./PublicRetailProductCard";

type CatalogState = { q?: string; category?: string; availability?: string; facets: Record<string, string[]>; mode?: PublicRetailCatalogMode; page: number };

export function PublicRetailCatalog({ categories, facets, locale, products, state }: { categories: PublicRetailCategoryDto[]; facets: PublicRetailFacetDto[]; locale: PublicRetailLocale; products: PublicRetailProductPageDto; state: CatalogState }) {
  const copy = retailCopy[locale];
  const rootCategories = categories.filter((item) => !item.parentId && !item.name.startsWith("-"));
  return <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
    <CatalogResultsHeader countLabel={`${copy.found}: ${products.totalCount}`} eyebrow="Novotech Retail" title={copy.catalog} />
    <div className="mt-5">
      <CatalogToolbarFrame>
        <details className="group relative shrink-0">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"><Menu aria-hidden="true" className="size-4" />{locale === "ro" ? "Categorii" : "Категории"}</summary>
          <nav aria-label={locale === "ro" ? "Categorii catalog" : "Категории каталога"} className="absolute left-0 top-12 z-20 grid max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto border border-zinc-200 bg-white p-2 shadow-xl">
            <Link className="min-h-11 px-3 py-3 text-sm font-medium hover:bg-zinc-50" href={`/catalog?lang=${locale}&view=all`}>{copy.allCategories}</Link>
            {rootCategories.map((category) => <Link className="min-h-11 px-3 py-3 text-sm hover:bg-zinc-50" href={`/catalog?lang=${locale}&category=${encodeURIComponent(category.slug)}`} key={category.id}>{category.name} <span className="text-zinc-400">({category.productCount})</span></Link>)}
          </nav>
        </details>
        <form action="/catalog" className="flex min-w-0 flex-1" role="search"><input name="lang" type="hidden" value={locale} /><label className="sr-only" htmlFor="catalog-search">{copy.search}</label><input className="min-h-11 min-w-0 flex-1 border border-r-0 border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700" defaultValue={state.q} id="catalog-search" name="q" placeholder={copy.search} /><button className="min-h-11 bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800">{copy.searchAction}</button></form>
        <Link className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 border border-zinc-300 px-4 text-sm font-semibold hover:border-emerald-700 hover:text-emerald-800" href={publicRetailShowcaseHref(locale)}><Sparkles aria-hidden="true" className="size-4" />{copy.showcase}</Link>
      </CatalogToolbarFrame>
    </div>
    <section aria-labelledby="retail-showcase-heading" className="border-b border-zinc-200 py-5">
      <h2 className="text-sm font-semibold" id="retail-showcase-heading">{copy.showcase}</h2>
      <nav aria-label={copy.showcase} className="mt-3 flex max-w-full gap-2 overflow-x-auto pb-1">
        <ShowcaseLink active={!state.q && state.mode === "popular"} href={`/catalog?lang=${locale}&view=popular`} label={copy.popular} />
        <ShowcaseLink active={!state.q && state.mode === "new"} href={`/catalog?lang=${locale}&view=new`} label={copy.newProducts} />
        <ShowcaseLink active={!state.q && state.mode === "hot"} href={`/catalog?lang=${locale}&view=hot`} label={copy.hotPrice} />
        <ShowcaseLink active={!state.q && state.mode === "price_asc"} href={`/catalog?lang=${locale}&sort=price_asc`} label={copy.byPrice} />
      </nav>
    </section>
    <div className="mt-5 flex justify-end"><SortForm locale={locale} state={state} /></div>
    <div className="mt-5 grid items-start gap-7 lg:grid-cols-[260px_minmax(0,1fr)]">
      <PublicCatalogFilters categories={categories} facets={facets} locale={locale} state={state} />
      <section aria-label={copy.products} className="min-w-0">
        {products.items.length ? <CatalogProductGridFrame>{products.items.map((product) => <PublicRetailProductCard key={product.id} locale={locale} product={product} />)}</CatalogProductGridFrame> : <EmptyCatalog message={copy.noProducts} title={copy.catalog} />}
        <Pagination locale={locale} products={products} state={state} />
      </section>
    </div>
  </div>;
}

function PublicCatalogFilters({ categories, facets, locale, state }: { categories: PublicRetailCategoryDto[]; facets: PublicRetailFacetDto[]; locale: PublicRetailLocale; state: CatalogState }) {
  const copy = retailCopy[locale];
  const selectedCount = (state.category ? 1 : 0) + (state.availability ? 1 : 0) + Object.values(state.facets).reduce((sum, values) => sum + values.length, 0);
  return <CatalogFilterShell closeLabel={locale === "ro" ? "Închide filtrele" : "Закрыть фильтры"} panelLabel={locale === "ro" ? "Filtre catalog" : "Фильтры каталога"} selectedCount={selectedCount} square triggerLabel={copy.filters}>
    <CatalogFilterPanel clearAction={<CatalogFilterLink className="text-xs font-medium text-emerald-700" href={`/catalog?lang=${locale}&view=all`}>{copy.reset}</CatalogFilterLink>} selectedCount={selectedCount} selectedLabel={locale === "ro" ? "Selectate" : "Выбрано"} title={copy.filters}>
      <CatalogFilterGroup defaultOpen title={locale === "ro" ? "Categorie" : "Категория"}>
        <CatalogFilterOption href={publicFilterHref(locale, state, { category: null })} label={copy.allCategories} selected={!state.category} />
        {categories.filter((item) => !item.parentId && !item.name.startsWith("-")).map((item) => <CatalogFilterOption count={item.productCount} href={publicFilterHref(locale, state, { category: item.slug })} key={item.id} label={item.name} selected={state.category === item.slug} />)}
      </CatalogFilterGroup>
      <CatalogFilterGroup defaultOpen title={locale === "ro" ? "Disponibilitate" : "Наличие"}>
        <CatalogFilterOption href={publicFilterHref(locale, state, { availability: null })} label={locale === "ro" ? "Toate" : "Все"} selected={!state.availability} />
        {(["in_stock", "low_stock", "available_to_order", "unavailable", "unknown"] as PublicRetailAvailability[]).map((value) => <CatalogFilterOption href={publicFilterHref(locale, state, { availability: value })} key={value} label={availabilityFilterLabel(locale, value)} selected={state.availability === value} />)}
      </CatalogFilterGroup>
      {facets.slice(0, 8).map((facet) => <CatalogFilterGroup key={facet.key} title={facet.label}>{facet.values.slice(0, 10).map((value) => <CatalogFilterOption count={value.count} href={publicFilterHref(locale, state, { facet: { key: facet.key, value: value.value } })} key={value.value} label={value.value} selected={state.facets[facet.key]?.includes(value.value) ?? false} />)}</CatalogFilterGroup>)}
    </CatalogFilterPanel>
  </CatalogFilterShell>;
}

function SortForm({ locale, state }: { locale: PublicRetailLocale; state: CatalogState }) {
  return <form action="/catalog" className="flex flex-wrap items-center gap-2 text-sm text-zinc-600"><input name="lang" type="hidden" value={locale} />{state.q ? <input name="q" type="hidden" value={state.q} /> : null}{state.category ? <input name="category" type="hidden" value={state.category} /> : null}{state.availability ? <input name="availability" type="hidden" value={state.availability} /> : null}{state.mode && !state.mode.startsWith("price_") ? <input name="view" type="hidden" value={state.mode} /> : null}{Object.entries(state.facets).flatMap(([key, values]) => values.map((value) => <input key={`${key}:${value}`} name={`facet_${key}`} type="hidden" value={value} />))}<label htmlFor="public-catalog-sort">{locale === "ro" ? "Sortare" : "Сортировка"}</label><select className="min-h-10 border border-zinc-300 bg-white px-3" defaultValue={state.mode?.startsWith("price_") ? state.mode : ""} id="public-catalog-sort" name="sort"><option value="">{locale === "ro" ? "Implicit" : "По умолчанию"}</option><option value="price_asc">{locale === "ro" ? "Preț crescător" : "Цена по возрастанию"}</option><option value="price_desc">{locale === "ro" ? "Preț descrescător" : "Цена по убыванию"}</option></select><button className="min-h-10 border border-zinc-300 px-3 font-medium">{retailCopy[locale].apply}</button></form>;
}

function Pagination({ locale, products, state }: { locale: PublicRetailLocale; products: PublicRetailProductPageDto; state: CatalogState }) {
  const totalPages = Math.max(1, Math.ceil(products.totalCount / products.limit));
  const hrefForPage = (target: number) => { const query = new URLSearchParams({ lang: locale, page: String(target) }); if (state.q) query.set("q", state.q); if (state.category) query.set("category", state.category); if (state.availability) query.set("availability", state.availability); if (state.mode?.startsWith("price_")) query.set("sort", state.mode); else if (state.mode) query.set("view", state.mode); Object.entries(state.facets).forEach(([key, values]) => values.forEach((value) => query.append(`facet_${key}`, value))); return `/catalog?${query}`; };
  return <div className="mt-8"><NumberedPagination ariaLabel={locale === "ro" ? "Paginare catalog" : "Пагинация каталога"} currentPage={state.page} hrefForPage={hrefForPage} nextAriaLabel={locale === "ro" ? "Pagina următoare" : "Следующая страница"} nextLabel={retailCopy[locale].next} previousAriaLabel={locale === "ro" ? "Pagina precedentă" : "Предыдущая страница"} previousLabel={retailCopy[locale].previous} square totalPages={totalPages} /></div>;
}

function ShowcaseLink({ active, href, label }: { active: boolean; href: string; label: string }) { return <Link aria-current={active ? "page" : undefined} className={`grid min-h-11 shrink-0 place-items-center border px-4 text-sm font-semibold transition-colors ${active ? "border-emerald-700 bg-emerald-700 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:border-emerald-700 hover:text-emerald-800"}`} href={href}>{label}</Link>; }
function CatalogFilterOption({ count, href, label, selected }: { count?: number; href: string; label: string; selected: boolean }) { return <CatalogFilterLink className="flex min-h-9 items-center gap-2 px-2 text-sm text-zinc-700 hover:bg-zinc-50" href={href}><span aria-hidden className={`grid size-4 shrink-0 place-items-center border ${selected ? "border-emerald-700 bg-emerald-700 text-white" : "border-zinc-300"}`}>{selected ? <Check className="size-3" /> : null}</span><span className="min-w-0 flex-1 break-words">{label}</span>{typeof count === "number" ? <span className="text-xs text-zinc-400">{count}</span> : null}</CatalogFilterLink>; }
function publicFilterHref(locale: PublicRetailLocale, state: CatalogState, change: { availability?: string | null; category?: string | null; facet?: { key: string; value: string } }) { const query = new URLSearchParams({ lang: locale, page: "1" }); const category = change.category === undefined ? state.category : change.category; const availability = change.availability === undefined ? state.availability : change.availability; if (state.q) query.set("q", state.q); if (category) query.set("category", category); if (availability) query.set("availability", availability); if (state.mode?.startsWith("price_")) query.set("sort", state.mode); else if (state.mode) query.set("view", state.mode); const nextFacets = Object.fromEntries(Object.entries(state.facets).map(([key, values]) => [key, [...values]])); if (change.facet) { const values = nextFacets[change.facet.key] ?? []; nextFacets[change.facet.key] = values.includes(change.facet.value) ? values.filter((item) => item !== change.facet?.value) : [...values, change.facet.value]; } Object.entries(nextFacets).forEach(([key, values]) => values.forEach((value) => query.append(`facet_${key}`, value))); return `/catalog?${query}`; }
function availabilityFilterLabel(locale: PublicRetailLocale, value: PublicRetailAvailability) { return locale === "ro" ? { in_stock: "În stoc", low_stock: "Stoc limitat", available_to_order: "La comandă", unavailable: "Indisponibil", unknown: "Disponibilitate în curs de confirmare" }[value] : { in_stock: "В наличии", low_stock: "Заканчивается", available_to_order: "Под заказ", unavailable: "Нет в наличии", unknown: "Наличие уточняется" }[value]; }

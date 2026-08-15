import { Menu, Sparkles } from "lucide-react";
import Link from "next/link";

import { CatalogFilterGroup, CatalogFilterPanel } from "../../catalog/components/CatalogFilterPanel";
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
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"><Menu aria-hidden="true" className="size-4" />{locale === "ro" ? "Categorii" : "Категории"}</summary>
          <nav aria-label={locale === "ro" ? "Categorii catalog" : "Категории каталога"} className="absolute left-0 top-12 z-20 grid max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-zinc-200 bg-white p-2 shadow-xl">
            <Link className="min-h-11 rounded px-3 py-3 text-sm font-medium hover:bg-zinc-50" href={`/catalog?lang=${locale}&view=all`}>{copy.allCategories}</Link>
            {rootCategories.map((category) => <Link className="min-h-11 rounded px-3 py-3 text-sm hover:bg-zinc-50" href={`/catalog?lang=${locale}&category=${encodeURIComponent(category.slug)}`} key={category.id}>{category.name} <span className="text-zinc-400">({category.productCount})</span></Link>)}
          </nav>
        </details>
        <form action="/catalog" className="flex min-w-0 flex-1" role="search"><input name="lang" type="hidden" value={locale} /><label className="sr-only" htmlFor="catalog-search">{copy.search}</label><input className="min-h-11 min-w-0 flex-1 rounded-l-md border border-r-0 border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700" defaultValue={state.q} id="catalog-search" name="q" placeholder={copy.search} /><button className="min-h-11 rounded-r-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800">{copy.searchAction}</button></form>
        <Link className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-semibold hover:border-emerald-700 hover:text-emerald-800" href={publicRetailShowcaseHref(locale)}><Sparkles aria-hidden="true" className="size-4" />{copy.showcase}</Link>
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
  return <CatalogFilterShell closeLabel={locale === "ro" ? "Închide filtrele" : "Закрыть фильтры"} panelLabel={locale === "ro" ? "Filtre catalog" : "Фильтры каталога"} selectedCount={selectedCount} triggerLabel={copy.filters}>
    <form action="/catalog"><input name="lang" type="hidden" value={locale} />{state.q ? <input name="q" type="hidden" value={state.q} /> : null}
      <CatalogFilterPanel clearAction={<Link className="text-xs font-medium text-emerald-700" href={`/catalog?lang=${locale}&view=all`}>{copy.reset}</Link>} selectedCount={selectedCount} selectedLabel={locale === "ro" ? "Selectate" : "Выбрано"} title={copy.filters}>
        <CatalogFilterGroup defaultOpen title={locale === "ro" ? "Categorie" : "Категория"}><label className="sr-only" htmlFor="public-category-filter">{copy.allCategories}</label><select className="min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm" defaultValue={state.category ?? ""} id="public-category-filter" name="category"><option value="">{copy.allCategories}</option>{categories.filter((item) => !item.parentId && !item.name.startsWith("-")).map((item) => <option key={item.id} value={item.slug}>{item.name} ({item.productCount})</option>)}</select></CatalogFilterGroup>
        <CatalogFilterGroup defaultOpen title={locale === "ro" ? "Disponibilitate" : "Наличие"}><div className="space-y-1">{(["in_stock", "low_stock", "available_to_order", "unavailable", "unknown"] as PublicRetailAvailability[]).map((value) => <label className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm text-zinc-700 hover:bg-zinc-50" key={value}><input defaultChecked={state.availability === value} name="availability" type="radio" value={value} />{availabilityFilterLabel(locale, value)}</label>)}</div></CatalogFilterGroup>
        {facets.slice(0, 8).map((facet) => <CatalogFilterGroup key={facet.key} title={facet.label}>{facet.values.slice(0, 10).map((value) => <label className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm text-zinc-700 hover:bg-zinc-50" key={value.value}><input defaultChecked={state.facets[facet.key]?.includes(value.value)} name={`facet_${facet.key}`} type="checkbox" value={value.value} /><span className="min-w-0 flex-1 break-words">{value.value}</span><span className="text-xs text-zinc-400">{value.count}</span></label>)}</CatalogFilterGroup>)}
        <button className="min-h-11 w-full rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-emerald-700">{copy.apply}</button>
      </CatalogFilterPanel>
    </form>
  </CatalogFilterShell>;
}

function SortForm({ locale, state }: { locale: PublicRetailLocale; state: CatalogState }) {
  return <form action="/catalog" className="flex flex-wrap items-center gap-2 text-sm text-zinc-600"><input name="lang" type="hidden" value={locale} />{state.q ? <input name="q" type="hidden" value={state.q} /> : null}{state.category ? <input name="category" type="hidden" value={state.category} /> : null}{state.availability ? <input name="availability" type="hidden" value={state.availability} /> : null}{state.mode && !state.mode.startsWith("price_") ? <input name="view" type="hidden" value={state.mode} /> : null}{Object.entries(state.facets).flatMap(([key, values]) => values.map((value) => <input key={`${key}:${value}`} name={`facet_${key}`} type="hidden" value={value} />))}<label htmlFor="public-catalog-sort">{locale === "ro" ? "Sortare" : "Сортировка"}</label><select className="min-h-10 rounded-md border border-zinc-300 bg-white px-3" defaultValue={state.mode?.startsWith("price_") ? state.mode : ""} id="public-catalog-sort" name="sort"><option value="">{locale === "ro" ? "Implicit" : "По умолчанию"}</option><option value="price_asc">{locale === "ro" ? "Preț crescător" : "Цена по возрастанию"}</option><option value="price_desc">{locale === "ro" ? "Preț descrescător" : "Цена по убыванию"}</option></select><button className="min-h-10 rounded-md border border-zinc-300 px-3 font-medium">{retailCopy[locale].apply}</button></form>;
}

function Pagination({ locale, products, state }: { locale: PublicRetailLocale; products: PublicRetailProductPageDto; state: CatalogState }) {
  const totalPages = Math.max(1, Math.ceil(products.totalCount / products.limit));
  const hrefForPage = (target: number) => { const query = new URLSearchParams({ lang: locale, page: String(target) }); if (state.q) query.set("q", state.q); if (state.category) query.set("category", state.category); if (state.availability) query.set("availability", state.availability); if (state.mode?.startsWith("price_")) query.set("sort", state.mode); else if (state.mode) query.set("view", state.mode); Object.entries(state.facets).forEach(([key, values]) => values.forEach((value) => query.append(`facet_${key}`, value))); return `/catalog?${query}`; };
  return <div className="mt-8"><NumberedPagination ariaLabel={locale === "ro" ? "Paginare catalog" : "Пагинация каталога"} currentPage={state.page} hrefForPage={hrefForPage} nextAriaLabel={locale === "ro" ? "Pagina următoare" : "Следующая страница"} nextLabel={retailCopy[locale].next} previousAriaLabel={locale === "ro" ? "Pagina precedentă" : "Предыдущая страница"} previousLabel={retailCopy[locale].previous} totalPages={totalPages} /></div>;
}

function ShowcaseLink({ active, href, label }: { active: boolean; href: string; label: string }) { return <Link aria-current={active ? "page" : undefined} className={`grid min-h-11 shrink-0 place-items-center rounded-md border px-4 text-sm font-semibold transition-colors ${active ? "border-emerald-700 bg-emerald-700 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:border-emerald-700 hover:text-emerald-800"}`} href={href}>{label}</Link>; }
function availabilityFilterLabel(locale: PublicRetailLocale, value: PublicRetailAvailability) { return locale === "ro" ? { in_stock: "În stoc", low_stock: "Stoc limitat", available_to_order: "La comandă", unavailable: "Indisponibil", unknown: "Disponibilitate în curs de confirmare" }[value] : { in_stock: "В наличии", low_stock: "Заканчивается", available_to_order: "Под заказ", unavailable: "Нет в наличии", unknown: "Наличие уточняется" }[value]; }

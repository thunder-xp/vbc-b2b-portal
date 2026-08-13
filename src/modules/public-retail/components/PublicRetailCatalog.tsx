import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import { retailCopy } from "../presentation";
import type { PublicRetailAvailability, PublicRetailCatalogMode, PublicRetailCategoryDto, PublicRetailFacetDto, PublicRetailLocale, PublicRetailProductPageDto } from "../types";
import { PublicRetailProductCard } from "./PublicRetailProductCard";

type CatalogState = { q?: string; category?: string; availability?: string; facets: Record<string, string[]>; mode?: PublicRetailCatalogMode; page: number };

export function PublicRetailCatalog({ categories, facets, locale, products, state }: { categories: PublicRetailCategoryDto[]; facets: PublicRetailFacetDto[]; locale: PublicRetailLocale; products: PublicRetailProductPageDto; state: CatalogState }) {
  const copy = retailCopy[locale];
  const filter = <FilterForm categories={categories} facets={facets} locale={locale} state={state} />;
  return <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-6">
      <div><p className="text-xs font-semibold uppercase text-emerald-700">Novotech Retail</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{copy.catalog}</h1><p className="mt-2 text-sm text-zinc-500">{copy.found}: {products.totalCount}</p></div>
      <form action="/catalog" className="flex w-full max-w-xl sm:w-auto sm:min-w-[32rem]" role="search"><input name="lang" type="hidden" value={locale} /><label className="sr-only" htmlFor="catalog-search">{copy.search}</label><input className="min-h-11 min-w-0 flex-1 border border-r-0 border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700" defaultValue={state.q} id="catalog-search" name="q" placeholder={copy.search} /><button className="min-h-11 bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800">{copy.searchAction}</button></form>
    </header>
    <section aria-labelledby="retail-showcase-heading" className="border-b border-zinc-200 py-5">
      <h2 className="text-sm font-semibold" id="retail-showcase-heading">{copy.showcase}</h2>
      <nav aria-label={copy.showcase} className="mt-3 flex max-w-full gap-2 overflow-x-auto pb-1">
        <ShowcaseLink active={!state.q && state.mode === "popular"} href={`/catalog?lang=${locale}&view=popular`} label={copy.popular} />
        <ShowcaseLink active={!state.q && state.mode === "new"} href={`/catalog?lang=${locale}&view=new`} label={copy.newProducts} />
        <ShowcaseLink active={!state.q && state.mode === "price_asc"} href={`/catalog?lang=${locale}&sort=price_asc`} label={copy.byPrice} />
      </nav>
    </section>
    <details className="mt-5 border border-zinc-200 lg:hidden"><summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold"><SlidersHorizontal aria-hidden="true" className="size-4" />{copy.filters}</summary><div className="border-t border-zinc-200 p-4">{filter}</div></details>
    <div className="mt-6 grid items-start gap-7 lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="sticky top-23 hidden max-h-[calc(100vh-7rem)] overflow-y-auto pr-2 lg:block" aria-label={copy.filters}>{filter}</aside>
      <section aria-label={copy.products}>
        {products.items.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 xl:gap-5">{products.items.map((product) => <PublicRetailProductCard key={product.id} locale={locale} product={product} />)}</div> : <div className="border border-dashed border-zinc-300 px-6 py-16 text-center text-sm text-zinc-600">{copy.noProducts}</div>}
        <Pagination locale={locale} products={products} state={state} />
      </section>
    </div>
  </div>;
}
function FilterForm({ categories, facets, locale, state }: { categories: PublicRetailCategoryDto[]; facets: PublicRetailFacetDto[]; locale: PublicRetailLocale; state: CatalogState }) {
  const copy = retailCopy[locale];
  return <form action="/catalog" className="space-y-6"><input name="lang" type="hidden" value={locale} />{state.q ? <input name="q" type="hidden" value={state.q} /> : null}
    <label className="block text-sm font-semibold">{copy.categoryFilter}<select className="mt-2 min-h-11 w-full border border-zinc-300 bg-white px-3 text-sm" defaultValue={state.category ?? ""} name="category"><option value="">{copy.allCategories}</option>{categories.filter((item) => !item.parentId && !item.name.startsWith("-")).map((item) => <option key={item.id} value={item.slug}>{item.name} ({item.productCount})</option>)}</select></label>
    <fieldset><legend className="text-sm font-semibold">{locale === "ro" ? "Disponibilitate" : "Наличие"}</legend><div className="mt-2 space-y-2">{(["in_stock", "low_stock", "available_to_order", "unavailable", "unknown"] as PublicRetailAvailability[]).map((value) => <label className="flex min-h-9 items-center gap-2 text-sm text-zinc-700" key={value}><input defaultChecked={state.availability === value} name="availability" type="radio" value={value} />{locale === "ro" ? { in_stock: "În stoc", low_stock: "Stoc limitat", available_to_order: "La comandă", unavailable: "Indisponibil", unknown: "Se confirmă" }[value] : { in_stock: "В наличии", low_stock: "Заканчивается", available_to_order: "Под заказ", unavailable: "Нет в наличии", unknown: "Уточняется" }[value]}</label>)}</div></fieldset>
    {facets.slice(0, 8).map((facet) => <fieldset className="border-t border-zinc-100 pt-4" key={facet.key}><legend className="text-sm font-semibold">{facet.label}</legend><div className="mt-2 max-h-44 space-y-1 overflow-y-auto">{facet.values.slice(0, 10).map((value) => <label className="flex min-h-9 items-center gap-2 text-sm text-zinc-700" key={value.value}><input defaultChecked={state.facets[facet.key]?.includes(value.value)} name={`facet_${facet.key}`} type="checkbox" value={value.value} /><span className="min-w-0 flex-1 break-words">{value.value}</span><span className="text-xs text-zinc-400">{value.count}</span></label>)}</div></fieldset>)}
    <div className="flex gap-2"><button className="min-h-11 flex-1 bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-emerald-700">{copy.apply}</button><Link className="grid min-h-11 place-items-center border border-zinc-300 px-3 text-sm font-semibold" href={`/catalog?lang=${locale}`}>{copy.reset}</Link></div>
  </form>;
}

function Pagination({ locale, products, state }: { locale: PublicRetailLocale; products: PublicRetailProductPageDto; state: CatalogState }) {
  const copy = retailCopy[locale];
  const page = state.page;
  const pages = Math.max(1, Math.ceil(products.totalCount / products.limit));
  if (pages <= 1) return null;
  const href = (target: number) => { const query = new URLSearchParams({ lang: locale, page: String(target) }); if (state.q) query.set("q", state.q); if (state.category) query.set("category", state.category); if (state.availability) query.set("availability", state.availability); if (state.mode?.startsWith("price_")) query.set("sort", state.mode); else if (state.mode) query.set("view", state.mode); Object.entries(state.facets).forEach(([key, values]) => values.forEach((value) => query.append(`facet_${key}`, value))); return `/catalog?${query}`; };
  return <nav aria-label="Пагинация" className="mt-8 flex items-center justify-between border-t border-zinc-200 pt-5"><span className="text-sm text-zinc-500">{page} / {pages}</span><div className="flex gap-2">{page > 1 ? <Link className="grid min-h-11 place-items-center border border-zinc-300 px-4 text-sm font-semibold" href={href(page - 1)}>{copy.previous}</Link> : null}{page < pages ? <Link className="grid min-h-11 place-items-center bg-zinc-950 px-4 text-sm font-semibold text-white" href={href(page + 1)}>{copy.next}</Link> : null}</div></nav>;
}

function ShowcaseLink({ active, href, label }: { active: boolean; href: string; label: string }) {
  return <Link aria-current={active ? "page" : undefined} className={`grid min-h-11 shrink-0 place-items-center border px-4 text-sm font-semibold transition-colors ${active ? "border-emerald-700 bg-emerald-700 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:border-emerald-700 hover:text-emerald-800"}`} href={href}>{label}</Link>;
}

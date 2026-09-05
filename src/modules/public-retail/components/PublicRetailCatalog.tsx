import { Check, Sparkles } from "lucide-react";
import Link from "next/link";

import { CatalogFilterGroup, CatalogFilterPanel } from "../../catalog/components/CatalogFilterPanel";
import { CatalogFilterLink } from "../../catalog/components/CatalogFilterLink";
import { CatalogFilterShell } from "../../catalog/components/CatalogFilterShell";
import { CatalogTechnicalFacetGroups } from "../../catalog/components/CatalogTechnicalFacetGroups";
import { catalogFacetQueryFields } from "../../catalog/services/catalog-facet-state";
import { EmptyCatalog } from "../../catalog/components/EmptyCatalog";
import { CatalogProductGridFrame, CatalogResultsHeader, CatalogToolbarFrame } from "../../catalog/components/CatalogPresentationPrimitives";
import { NumberedPagination } from "../../platform-ui";
import { publicRetailFilterHref, publicRetailMerchandisingHref, type PublicRetailCatalogState } from "../catalog-links";
import { publicRetailMerchandisingBadge, publicRetailShowcaseHref, publicRetailVisibleCategories, retailCopy } from "../presentation";
import type { PublicRetailAvailability, PublicRetailCategoryDto, PublicRetailFacetDto, PublicRetailLocale, PublicRetailProductPageDto } from "../types";
import { PublicRetailProductCard } from "./PublicRetailProductCard";
import { PublicRetailCategoryMenu } from "./PublicRetailCategoryMenu";
import { PublicRetailSearchForm } from "./PublicRetailSearchForm";
import { PublicBreadcrumbs, type PublicBreadcrumbItem } from "./PublicBreadcrumbs";
import type { PublicCategoryContent } from "../content";
import type { PublicBlogCard } from "../../public-blog/types";
import { PublicBlogInlineLinks } from "../../public-blog/components";

type CatalogState = PublicRetailCatalogState;

export function PublicRetailCatalog({ blogArticles = [], breadcrumbs, categories, categoryContent, facets, locale, products, state }: { blogArticles?: PublicBlogCard[]; breadcrumbs?: PublicBreadcrumbItem[]; categories: PublicRetailCategoryDto[]; categoryContent?: PublicCategoryContent | null; facets: PublicRetailFacetDto[]; locale: PublicRetailLocale; products: PublicRetailProductPageDto; state: CatalogState }) {
  const copy = retailCopy[locale];
  const pageTitle = categoryContent?.heading ?? (state.mode === "replenishment" ? copy.replenishmentCollection : copy.catalog);
  const collectionBadge = state.mode ? publicRetailMerchandisingBadge(locale, state.mode) : undefined;
  const visibleCategories = publicRetailVisibleCategories(categories);
  const filterableFacetKeys = new Set(facets.map((facet) => facet.key));
  return <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
    {categoryContent && breadcrumbs ? <PublicBreadcrumbs items={breadcrumbs} label={locale === "ro" ? "Navigare ierarhică" : "Хлебные крошки"} /> : null}
    {categoryContent ? <div className="mt-4" data-content-source={categoryContent.source}>
      <CatalogResultsHeader action={state.mode ? undefined : <SortForm locale={locale} state={state} />} eyebrow="Novotech Retail" eyebrowTone="retail" title={pageTitle} />
      <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">{categoryContent.intro}</p>
      <CategoryTaxonomyLinks content={categoryContent} locale={locale} />
    </div> : <CatalogResultsHeader action={state.mode ? undefined : <SortForm locale={locale} state={state} />} eyebrow="Novotech Retail" eyebrowTone="retail" title={pageTitle} />}
    <div className="mt-5">
      <CatalogToolbarFrame>
        <PublicRetailCategoryMenu categories={visibleCategories.map(publicRetailMenuCategory)} locale={locale} />
        <PublicRetailSearchForm defaultValue={state.q} id="catalog" locale={locale} />
        <Link className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 border border-zinc-300 px-4 text-sm font-semibold hover:border-blue-700 hover:text-blue-800" href={publicRetailShowcaseHref(locale)}><Sparkles aria-hidden="true" className="size-4" />{copy.showcase}</Link>
      </CatalogToolbarFrame>
    </div>
    <section aria-labelledby="retail-showcase-heading" className="border-b border-zinc-200 py-5">
      <h2 className="text-sm font-semibold" id="retail-showcase-heading">{copy.showcase}</h2>
      <nav aria-label={copy.showcase} className="mt-3 flex max-w-full gap-2 overflow-x-auto pb-1">
        <ShowcaseLink active={state.mode === "popular"} href={publicRetailMerchandisingHref(locale, "popular", state)} label={copy.popular} />
        <ShowcaseLink active={state.mode === "new"} href={publicRetailMerchandisingHref(locale, "new", state)} label={copy.newProducts} />
        <ShowcaseLink active={state.mode === "hot"} href={publicRetailMerchandisingHref(locale, "hot", state)} label={copy.hotPrice} />
        <ShowcaseLink active={state.mode === "special"} href={publicRetailMerchandisingHref(locale, "special", state)} label={copy.specialOffers} />
        <ShowcaseLink active={state.mode === "replenishment"} href={publicRetailMerchandisingHref(locale, "replenishment", state)} label={copy.replenishment} />
      </nav>
    </section>
    <div className="mt-5 grid min-w-0 items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <PublicCatalogFilters facets={facets} locale={locale} state={state} />
      <section aria-label={copy.products} className="min-w-0">
        {products.items.length ? <CatalogProductGridFrame layout="public-retail">{products.items.map((product) => <PublicRetailProductCard badge={collectionBadge?.label} badgeVariant={collectionBadge?.variant} catalogState={state} filterableFacetKeys={filterableFacetKeys} key={product.id} locale={locale} product={product} showFacetShortcuts />)}</CatalogProductGridFrame> : <EmptyCatalog message={copy.noProducts} title={pageTitle} />}
        <Pagination locale={locale} products={products} state={state} />
      </section>
    </div>
    <PublicBlogInlineLinks articles={blogArticles} locale={locale} title={locale === "ro" ? "Ghiduri pentru această categorie" : "Материалы по этой категории"} />
  </div>;
}

function publicRetailMenuCategory(category: PublicRetailCategoryDto) {
  return { id: category.id, name: category.name, parentId: category.parentId, slug: category.slug };
}

function CategoryTaxonomyLinks({ content, locale }: { content: PublicCategoryContent; locale: PublicRetailLocale }) {
  const links = content.children.length ? content.children : content.siblings;
  if (!links.length) return null;
  return <nav aria-label={locale === "ro" ? "Categorii asociate" : "Связанные категории"} className="mt-4 flex flex-wrap items-center gap-2">
    <span className="mr-1 text-xs font-semibold text-zinc-500">{locale === "ro" ? "Vedeți și" : "Смотрите также"}</span>
    {links.map((category) => <Link className="inline-flex min-h-10 items-center border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:border-blue-700 hover:text-blue-800" href={`/catalog?lang=${locale}&category=${category.slug}`} key={category.id}>{category.name}</Link>)}
  </nav>;
}

function PublicCatalogFilters({ facets, locale, state }: { facets: PublicRetailFacetDto[]; locale: PublicRetailLocale; state: CatalogState }) {
  const copy = retailCopy[locale];
  const selectedCount = (state.availability ? 1 : 0) + Object.values(state.attributeFilters).reduce((sum, values) => sum + values.length, 0);
  return <CatalogFilterShell closeLabel={locale === "ro" ? "Închide filtrele" : "Закрыть фильтры"} panelLabel={locale === "ro" ? "Filtre catalog" : "Фильтры каталога"} selectedCount={selectedCount} square triggerLabel={copy.filters}>
    <CatalogFilterPanel clearAction={<CatalogFilterLink className="text-xs font-medium text-blue-700" href={`/catalog?lang=${locale}&view=all`}>{copy.reset}</CatalogFilterLink>} selectedCount={selectedCount} selectedLabel={locale === "ro" ? "Selectate" : "Выбрано"} title={copy.filters}>
      <CatalogFilterGroup defaultOpen title={locale === "ro" ? "Disponibilitate" : "Наличие"}>
        <CatalogFilterOption href={publicRetailFilterHref(locale, state, { availability: null })} label={locale === "ro" ? "Toate" : "Все"} selected={!state.availability} />
        {(["in_stock", "low_stock", "available_to_order", "unavailable", "unknown"] as PublicRetailAvailability[]).map((value) => <CatalogFilterOption href={publicRetailFilterHref(locale, state, { availability: value })} key={value} label={availabilityFilterLabel(locale, value)} selected={state.availability === value} />)}
      </CatalogFilterGroup>
      <CatalogTechnicalFacetGroups facets={facets} hrefForSelection={(selection) => publicRetailFilterHref(locale, { ...state, attributeFilters: selection }, {})} selection={state.attributeFilters} tone="retail" />
    </CatalogFilterPanel>
  </CatalogFilterShell>;
}

function SortForm({ locale, state }: { locale: PublicRetailLocale; state: CatalogState }) {
  return <form action="/catalog" aria-label={locale === "ro" ? "Sortare catalog" : "Сортировка каталога"} className="flex w-full flex-wrap items-center gap-2 text-sm text-zinc-600 sm:w-auto sm:justify-end"><input name="lang" type="hidden" value={locale} /><input name="view" type="hidden" value="all" />{state.q ? <input name="q" type="hidden" value={state.q} /> : null}{state.category ? <input name="category" type="hidden" value={state.category} /> : null}{state.availability ? <input name="availability" type="hidden" value={state.availability} /> : null}{Object.entries(catalogFacetQueryFields(state.attributeFilters)).map(([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}<label htmlFor="public-catalog-sort">{locale === "ro" ? "Sortare" : "Сортировка"}</label><select className="min-h-10 min-w-0 flex-1 border border-zinc-300 bg-white px-3 sm:flex-none" defaultValue={state.sort ?? ""} id="public-catalog-sort" name="sort"><option value="">{locale === "ro" ? "Implicit" : "По умолчанию"}</option><option value="price_asc">{locale === "ro" ? "Preț crescător" : "Цена по возрастанию"}</option><option value="price_desc">{locale === "ro" ? "Preț descrescător" : "Цена по убыванию"}</option></select><button className="min-h-10 border border-zinc-300 px-3 font-medium">{retailCopy[locale].apply}</button></form>;
}

function Pagination({ locale, products, state }: { locale: PublicRetailLocale; products: PublicRetailProductPageDto; state: CatalogState }) {
  const totalPages = Math.max(1, Math.ceil(products.totalCount / products.limit));
  const hrefForPage = (target: number) => { const query = new URLSearchParams({ lang: locale, page: String(target) }); if (state.q) query.set("q", state.q); if (state.category) query.set("category", state.category); if (state.availability) query.set("availability", state.availability); if (state.sort) query.set("sort", state.sort); if (state.mode) query.set("view", state.mode); if (state.returnHref) query.set("return", state.returnHref); Object.entries(catalogFacetQueryFields(state.attributeFilters)).forEach(([key, value]) => query.set(key, value)); return `/catalog?${query}`; };
  return <div className="mt-8"><NumberedPagination ariaLabel={locale === "ro" ? "Paginare catalog" : "Пагинация каталога"} currentPage={state.page} hrefForPage={hrefForPage} nextAriaLabel={locale === "ro" ? "Pagina următoare" : "Следующая страница"} nextLabel={retailCopy[locale].next} previousAriaLabel={locale === "ro" ? "Pagina precedentă" : "Предыдущая страница"} previousLabel={retailCopy[locale].previous} square tone="retail" totalPages={totalPages} /></div>;
}

function ShowcaseLink({ active, href, label }: { active: boolean; href: string; label: string }) { return <Link aria-current={active ? "page" : undefined} className={`grid min-h-11 shrink-0 place-items-center border px-4 text-sm font-semibold transition-colors ${active ? "border-blue-700 bg-blue-700 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:border-blue-700 hover:text-blue-800"}`} href={href}>{label}</Link>; }
function CatalogFilterOption({ count, href, label, selected }: { count?: number; href: string; label: string; selected: boolean }) { return <CatalogFilterLink className="flex min-h-9 items-center gap-2 px-2 text-sm text-zinc-700 hover:bg-zinc-50" href={href}><span aria-hidden className={`grid size-4 shrink-0 place-items-center border ${selected ? "border-blue-700 bg-blue-700 text-white" : "border-zinc-300"}`}>{selected ? <Check className="size-3" /> : null}</span><span className="min-w-0 flex-1 break-words">{label}</span>{typeof count === "number" ? <span className="text-xs text-zinc-400">{count}</span> : null}</CatalogFilterLink>; }
function availabilityFilterLabel(locale: PublicRetailLocale, value: PublicRetailAvailability) { return locale === "ro" ? { in_stock: "În stoc", low_stock: "Stoc limitat", available_to_order: "La comandă", unavailable: "Indisponibil", unknown: "Disponibilitate în curs de confirmare" }[value] : { in_stock: "В наличии", low_stock: "Заканчивается", available_to_order: "Под заказ", unavailable: "Нет в наличии", unknown: "Наличие уточняется" }[value]; }

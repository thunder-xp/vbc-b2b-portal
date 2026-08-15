import { ArrowRight, LayoutGrid } from "lucide-react";
import Link from "next/link";

import { publicRetailFullCatalogHref, retailCopy } from "../presentation";
import type { MerchandisingLabelCode } from "../../merchandising/types";
import type { PublicRetailLocale, PublicRetailProductSummaryDto, PublicRetailShowcaseDto } from "../types";
import { PublicRetailProductCard } from "./PublicRetailProductCard";
import { CatalogProductGridFrame, CatalogResultsHeader, CatalogToolbarFrame } from "../../catalog/components/CatalogPresentationPrimitives";

export function PublicRetailShowcase({ locale, showcase }: { locale: PublicRetailLocale; showcase: PublicRetailShowcaseDto }) {
  const copy = retailCopy[locale];
  return <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
    <CatalogResultsHeader eyebrow="Novotech Retail" title={copy.catalog} />
    <div className="mt-5"><CatalogToolbarFrame>
        <form action="/catalog" className="flex min-w-0 flex-1 md:min-w-[28rem]" role="search"><input name="lang" type="hidden" value={locale} /><label className="sr-only" htmlFor="showcase-search">{copy.search}</label><input className="min-h-11 min-w-0 flex-1 border border-r-0 border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700" id="showcase-search" name="q" placeholder={copy.search} /><button className="min-h-11 bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800">{copy.searchAction}</button></form>
        <Link className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 border border-zinc-300 px-4 text-sm font-semibold hover:border-emerald-700 hover:text-emerald-800" href={publicRetailFullCatalogHref(locale)}><LayoutGrid aria-hidden="true" className="size-4" />{copy.catalog}</Link>
    </CatalogToolbarFrame></div>
    <div className="divide-y divide-zinc-200">
      <ShowcaseSection badge={copy.popularBadge} badgeCode="TOP" href={`/catalog?lang=${locale}&view=popular`} locale={locale} products={showcase.popular} title={copy.popularProducts} />
      <ShowcaseSection badge={copy.newBadge} badgeCode="NEW" href={`/catalog?lang=${locale}&view=new`} locale={locale} products={showcase.new} title={copy.newProducts} />
      <ShowcaseSection badge={copy.hotBadge} badgeCode="HOT" href={`/catalog?lang=${locale}&view=hot`} locale={locale} products={showcase.hot} title={copy.hotPrice} />
    </div>
  </div>;
}

function ShowcaseSection({ badge, badgeCode, href, locale, products, title }: { badge: string; badgeCode: MerchandisingLabelCode; href: string; locale: PublicRetailLocale; products: PublicRetailProductSummaryDto[]; title: string }) {
  const copy = retailCopy[locale];
  return <section className="py-5" aria-labelledby={`showcase-${href.split("=").at(-1)}`}>
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 className="text-xl font-semibold" id={`showcase-${href.split("=").at(-1)}`}>{title}</h2>
      <Link className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold text-emerald-800 hover:text-emerald-950" href={href}>{copy.showAll}<ArrowRight aria-hidden="true" className="size-4" /></Link>
    </div>
    {products.length ? <CatalogProductGridFrame>{products.map((product) => <PublicRetailProductCard badge={badge} badgeCode={badgeCode} key={product.id} locale={locale} product={product} />)}</CatalogProductGridFrame> : <p className="border border-dashed border-zinc-300 px-6 py-10 text-center text-sm text-zinc-600">{copy.emptyShowcase}</p>}
  </section>;
}

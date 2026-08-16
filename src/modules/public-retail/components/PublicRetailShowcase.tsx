import { ArrowRight, LayoutGrid } from "lucide-react";
import Link from "next/link";

import { publicRetailFullCatalogHref, publicRetailVisibleCategories, retailCopy } from "../presentation";
import type { MerchandisingLabelCode } from "../../merchandising/types";
import type { PublicRetailCategoryDto, PublicRetailLocale, PublicRetailProductSummaryDto, PublicRetailShowcaseDto } from "../types";
import { PublicRetailProductCard } from "./PublicRetailProductCard";
import { PublicRetailCategoryMenu } from "./PublicRetailCategoryMenu";
import { CatalogProductGridFrame, CatalogResultsHeader, CatalogToolbarFrame } from "../../catalog/components/CatalogPresentationPrimitives";
import { PublicRetailSearchForm } from "./PublicRetailSearchForm";

export function PublicRetailShowcase({ categories, locale, showcase }: { categories: PublicRetailCategoryDto[]; locale: PublicRetailLocale; showcase: PublicRetailShowcaseDto }) {
  const copy = retailCopy[locale];
  return <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
    <CatalogResultsHeader eyebrow="Novotech Retail" eyebrowTone="retail" title={copy.showcase} />
    <div className="mt-5"><CatalogToolbarFrame>
        <PublicRetailCategoryMenu categories={publicRetailVisibleCategories(categories)} locale={locale} />
        <PublicRetailSearchForm id="showcase" locale={locale} />
        <Link className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 border border-zinc-300 px-4 text-sm font-semibold hover:border-blue-700 hover:text-blue-800" href={publicRetailFullCatalogHref(locale)}><LayoutGrid aria-hidden="true" className="size-4" />{locale === "ro" ? "Echipamente" : "Оборудование"}</Link>
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
      <Link className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold text-blue-800 hover:text-blue-950" href={href}>{copy.showAll}<ArrowRight aria-hidden="true" className="size-4" /></Link>
    </div>
    {products.length ? <CatalogProductGridFrame>{products.map((product) => <PublicRetailProductCard badge={badge} badgeCode={badgeCode} key={product.id} locale={locale} product={product} />)}</CatalogProductGridFrame> : <p className="border border-dashed border-zinc-300 px-6 py-10 text-center text-sm text-zinc-600">{copy.emptyShowcase}</p>}
  </section>;
}

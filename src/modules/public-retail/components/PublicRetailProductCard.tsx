import { ArrowRight, ImageIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { MerchandisingBadges } from "../../catalog/components/MerchandisingBadges";
import { CatalogProductCardFrame } from "../../catalog/components/CatalogProductCardFrame";
import type { MerchandisingLabelCode } from "../../merchandising/types";
import { publicRetailFilterHref, type PublicRetailCatalogState } from "../catalog-links";
import { availabilityCopy, availabilityTone, formatRetailCardPrice, retailCopy } from "../presentation";
import type { PublicRetailLocale, PublicRetailProductSummaryDto } from "../types";
import { PublicRetailAddToCartButton } from "./PublicRetailAddToCartButton";

export function PublicRetailProductCard({ product, locale, badge, badgeCode, catalogState, filterableFacetKeys, showFacetShortcuts = false }: { product: PublicRetailProductSummaryDto; locale: PublicRetailLocale; badge?: string; badgeCode?: MerchandisingLabelCode; catalogState?: PublicRetailCatalogState; filterableFacetKeys?: ReadonlySet<string>; showFacetShortcuts?: boolean }) {
  const copy = retailCopy[locale];
  const metadata = `${copy.sku} ${product.sku}`;
  const facetState = catalogState ?? { category: product.category?.slug, attributeFilters: {}, page: 1 };
  const facetShortcuts = product.highlights
    .filter((item) => /^property_[0-9a-f-]{36}$/.test(item.key) && (!filterableFacetKeys || filterableFacetKeys.has(item.key)))
    .slice(0, 2);
  return <CatalogProductCardFrame
    actions={<div className="grid grid-cols-[minmax(0,1fr)_2.75rem] items-start gap-2"><PublicRetailAddToCartButton compact locale={locale} publicProductId={product.id} source="catalog" /><Link aria-label={locale === "ro" ? `Mai multe detalii despre produsul ${product.name}` : `Подробнее о товаре ${product.name}`} className="grid size-11 place-items-center border border-zinc-300 hover:border-blue-700 hover:text-blue-800" href={`/products/${product.slug}?lang=${locale}`} title={copy.details}><ArrowRight aria-hidden="true" className="size-4" /></Link></div>}
    availability={<p className={`flex min-h-5 items-center gap-2 text-xs font-semibold ${availabilityTone(product.availability)}`}><span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />{availabilityCopy[locale][product.availability]}</p>}
    commercial={<div><p className="text-lg font-semibold tabular-nums">{formatRetailCardPrice(product.price.amount, product.price.currency, locale)}</p><p className="text-[11px] text-zinc-500">{copy.price}</p></div>}
    context={showFacetShortcuts && facetShortcuts.length ? <ul aria-label={copy.specifications} className="flex h-5 min-w-0 gap-1 overflow-hidden">{facetShortcuts.map((item) => <li className="min-w-0" key={item.key}><Link aria-label={`${item.label}: ${item.value}`} className="block max-w-28 truncate border border-zinc-200 px-1.5 text-[11px] leading-[18px] text-zinc-600 hover:border-blue-600 hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-600" href={publicRetailFilterHref(locale, facetState, { facet: { key: item.key, value: item.value }, facetMode: "include" })} prefetch={false} title={`${item.label}: ${item.value}`}>{item.value}</Link></li>)}</ul> : null}
    density="compact"
    media={<Link className="group relative block aspect-[4/3] w-full min-w-0 max-w-full overflow-hidden bg-zinc-50 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600" href={`/products/${product.slug}?lang=${locale}`}>
      {badge && badgeCode ? <span className="absolute left-2 top-2 z-10 max-w-[calc(100%-1rem)] shadow-sm"><MerchandisingBadges labelOverrides={{ [badgeCode]: badge }} labels={[badgeCode]} square tone="retail" /></span> : null}
      {product.image ? <Image alt={product.image.alt || product.name} className="size-full max-h-full max-w-full object-contain p-3 transition-transform duration-200 group-hover:scale-[1.02]" fill loading="lazy" sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw" src={product.image.url} /> : <span className="grid size-full max-h-full max-w-full place-items-center overflow-hidden text-zinc-300"><ImageIcon aria-hidden="true" className="size-12" /><span className="sr-only">{locale === "ro" ? "Imagine indisponibilă" : "Изображение отсутствует"}</span></span>}
    </Link>}
    metadata={<p className="truncate text-[11px] font-medium uppercase text-zinc-500" title={metadata}>{metadata}</p>}
    square
    tone="retail"
    title={<Link aria-label={product.name} className="line-clamp-2 h-10 rounded-sm text-sm font-semibold leading-5 text-zinc-950 outline-none hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500" href={`/products/${product.slug}?lang=${locale}`} title={product.name}>{product.name}</Link>}
  />;
}

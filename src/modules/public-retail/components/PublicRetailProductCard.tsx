import { ArrowRight, ImageIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { MerchandisingBadge, MerchandisingBadgeOverlay, type MerchandisingBadgeVariant } from "../../catalog/components/MerchandisingBadges";
import { CatalogProductCardFrame } from "../../catalog/components/CatalogProductCardFrame";
import { publicRetailFilterHref, type PublicRetailCatalogState } from "../catalog-links";
import { availabilityCopy, availabilityTone, formatRetailCardPrice, retailCopy } from "../presentation";
import type { PublicRetailLocale, PublicRetailProductSummaryDto } from "../types";
import { PublicRetailAddToCartButton } from "./PublicRetailAddToCartButton";

export function PublicRetailProductCard({ product, locale, badge, badgeVariant, catalogState, filterableFacetKeys, showFacetShortcuts = false }: { product: PublicRetailProductSummaryDto; locale: PublicRetailLocale; badge?: string; badgeVariant?: MerchandisingBadgeVariant; catalogState?: PublicRetailCatalogState; filterableFacetKeys?: ReadonlySet<string>; showFacetShortcuts?: boolean }) {
  const copy = retailCopy[locale];
  const metadata = `${copy.sku} ${product.sku}`;
  const facetState = catalogState ?? { category: product.category?.slug, attributeFilters: {}, page: 1 };
  const facetShortcuts = product.highlights
    .filter((item) => /^property_[0-9a-f-]{36}$/.test(item.key) && (!filterableFacetKeys || filterableFacetKeys.has(item.key)))
    .slice(0, 2);
  return <CatalogProductCardFrame
    actions={<div className="public-catalog-card-actions"><PublicRetailAddToCartButton compact locale={locale} publicProductId={product.id} source="catalog" /><Link aria-label={locale === "ro" ? `Mai multe detalii despre produsul ${product.name}` : `Подробнее о товаре ${product.name}`} className="public-catalog-card-detail" href={`/products/${product.slug}?lang=${locale}`} title={copy.details}><ArrowRight aria-hidden="true" className="size-4" /></Link></div>}
    availability={<p className={`public-catalog-card-availability ${availabilityTone(product.availability)}`}><span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />{availabilityCopy[locale][product.availability]}</p>}
    commercial={<div><p className="public-catalog-card-price">{formatRetailCardPrice(product.price.amount, product.price.currency, locale)}</p><p className="public-catalog-card-price-label">{copy.price}</p></div>}
    context={showFacetShortcuts && facetShortcuts.length ? <ul aria-label={copy.specifications} className="public-catalog-card-facets">{facetShortcuts.map((item) => <li className="min-w-0" key={item.key}><Link aria-label={`${item.label}: ${item.value}`} className="public-catalog-card-facet" href={publicRetailFilterHref(locale, facetState, { facet: { key: item.key, value: item.value }, facetMode: "include" })} prefetch={false} title={`${item.label}: ${item.value}`}>{item.value}</Link></li>)}</ul> : null}
    density="compact"
    media={<Link className="public-catalog-card-media" href={`/products/${product.slug}?lang=${locale}`}>
      {badge && badgeVariant ? <MerchandisingBadgeOverlay><MerchandisingBadge label={badge} variant={badgeVariant} /></MerchandisingBadgeOverlay> : null}
      {product.image ? <Image alt={product.image.alt || product.name} className="public-catalog-card-image" fill loading="lazy" sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw" src={product.image.url} /> : <span className="public-catalog-card-placeholder"><ImageIcon aria-hidden="true" className="size-12" /><span className="sr-only">{locale === "ro" ? "Imagine indisponibilă" : "Изображение отсутствует"}</span></span>}
    </Link>}
    metadata={<p className="public-catalog-card-sku" title={metadata}>{metadata}</p>}
    square
    tone="retail"
    title={<Link aria-label={product.name} className="public-catalog-card-title" href={`/products/${product.slug}?lang=${locale}`} title={product.name}>{product.name}</Link>}
  />;
}

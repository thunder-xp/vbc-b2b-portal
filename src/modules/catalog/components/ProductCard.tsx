import Link from "next/link";

import type { ProductCardCapabilityModel } from "../../partner-cabinet/services";
import type { ProductCommercialViewDto } from "../../pricing-inventory";
import { FavoriteProductButton } from "../../purchasing-lists/components/FavoriteProductButton";
import type { CatalogProductCardDto } from "../services";
import { CatalogCardImage } from "./CatalogCardImage";
import { CatalogQuantityCartAction } from "./CatalogQuantityCartAction";
import { ProductPricingBlock } from "./ProductPricingBlock";
import { ProductAvailabilityBlock } from "./ProductAvailabilityBlock";
import { ProductComparisonAction } from "./ProductComparisonAction";
import { ProductSpecificationAction } from "./ProductSpecificationAction";
import { MerchandisingBadge, MerchandisingBadgeOverlay, MerchandisingBadges } from "./MerchandisingBadges";
import { CatalogProductCardFrame } from "./CatalogProductCardFrame";
import { BehaviorTrackedLink } from "../../behavior-analytics/components/BehaviorViewEvent";
import type { BehaviorEventName } from "../../behavior-analytics/types";
import { getCatalogCopy, type PartnerLocale } from "../../partner-locale";

type ProductCardProps = { product: CatalogProductCardDto; analyticsEventName?: BehaviorEventName; analyticsSurface?: string; cartSuccessEventName?: BehaviorEventName; commercialView?: ProductCommercialViewDto; capabilities: ProductCardCapabilityModel; companyId?: string | null; contextBadge?: string; contextLine?: string; detailHref?: string; favorite?: boolean; imagePriority?: boolean; locale?: PartnerLocale; userId?: string | null };

export function ProductCard({ analyticsEventName, analyticsSurface, cartSuccessEventName, capabilities, commercialView, companyId = null, contextBadge, contextLine, detailHref, favorite = false, imagePriority = false, locale = "ru", product, userId = null }: ProductCardProps) {
  const copy = getCatalogCopy(locale);
  const productHref = detailHref ?? `/cabinet/catalog/${product.slug}`;
  const image = <>
    <CatalogCardImage alt={product.name} priority={imagePriority} sizes="(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) 50vw, (max-width: 1279px) 33vw, (max-width: 1535px) 25vw, 20vw" src={product.imageUrl} />
    {contextBadge || product.merchandisingLabels?.length ? <MerchandisingBadgeOverlay>
      {contextBadge ? <MerchandisingBadge label={contextBadge} variant="REPLENISHMENT" /> : <MerchandisingBadges labelOverrides={{ HOT: copy.hot, NEW: copy.new, SPECIAL_OFFER: copy.special, TOP: copy.top }} labels={product.merchandisingLabels ?? []} productCollectionsLabel={copy.productCollections} />}
    </MerchandisingBadgeOverlay> : null}
  </>;

  return <CatalogProductCardFrame
    actions={capabilities.canAddToOrder ? <CatalogQuantityCartAction productId={product.id} sourceSurface={analyticsSurface} successEventName={cartSuccessEventName} /> : <Link className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-emerald-700 text-sm font-semibold text-emerald-700" href={productHref} prefetch={false}>{copy.details}</Link>}
    availability={capabilities.showStock ? <ProductAvailabilityBlock locale={locale} stock={commercialView?.stock} /> : null}
    commercial={capabilities.showPrice ? <ProductPricingBlock commercialView={commercialView} locale={locale} showPartnerPrice={capabilities.showPartnerPrice} showRetailPrice={capabilities.showRetailPrice} /> : null}
    context={contextLine ? <p className="line-clamp-2 min-h-8 text-xs text-zinc-500">{contextLine}</p> : null}
    media={analyticsSurface ? <BehaviorTrackedLink className="relative block aspect-[4/3] overflow-hidden bg-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600" eventName={analyticsEventName} href={productHref} productId={product.id} sourceSurface={analyticsSurface}>{image}</BehaviorTrackedLink> : <Link className="relative block aspect-[4/3] overflow-hidden bg-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600" href={productHref} prefetch={false}>{image}</Link>}
    metadata={<p className="truncate text-[11px] font-medium uppercase text-zinc-500" title={`SKU ${product.sku}`}>SKU {product.sku}</p>}
    secondaryActions={<>{capabilities.canManagePurchasingLists ? <FavoriteProductButton compact initialSaved={favorite} productId={product.id} withListChooser /> : null}{capabilities.canAddToSpecification ? <ProductSpecificationAction compact productId={product.id} /> : null}{companyId && userId ? <ProductComparisonAction categoryId={product.category?.id ?? null} companyId={companyId} compact productId={product.id} userId={userId} /> : null}</>}
    title={<Link className="line-clamp-2 h-10 rounded-sm text-sm font-semibold leading-5 text-zinc-950 outline-none hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500" href={productHref} prefetch={false} title={product.name}>{product.name}</Link>}
  />;
}

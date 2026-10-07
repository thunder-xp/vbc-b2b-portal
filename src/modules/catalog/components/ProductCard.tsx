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
import { MerchandisingBadge, MerchandisingBadgeOverlay, MerchandisingBadges, type MerchandisingBadgeVariant } from "./MerchandisingBadges";
import { CatalogProductCardFrame } from "./CatalogProductCardFrame";
import { BehaviorTrackedLink } from "../../behavior-analytics/components/BehaviorViewEvent";
import type { BehaviorEventName } from "../../behavior-analytics/types";
import { getCatalogCopy, type PartnerLocale } from "../../partner-locale";
import { toLiveCommerceSelectionProduct } from "../services/live-commerce-selection";

type ProductCardProps = { product: CatalogProductCardDto; analyticsEventName?: BehaviorEventName; analyticsSurface?: string; cartSuccessEventName?: BehaviorEventName; commercialView?: ProductCommercialViewDto; capabilities: ProductCardCapabilityModel; companyId?: string | null; contextBadge?: string; contextBadgeVariant?: MerchandisingBadgeVariant; contextLine?: string; detailHref?: string; favorite?: boolean; imagePriority?: boolean; locale?: PartnerLocale; userId?: string | null; variant?: "default" | "cobuy" };

export function ProductCard({ analyticsEventName, analyticsSurface, cartSuccessEventName, capabilities, commercialView, companyId = null, contextBadge, contextBadgeVariant = "REPLENISHMENT", contextLine, detailHref, favorite = false, imagePriority = false, locale = "ru", product, userId = null, variant = "default" }: ProductCardProps) {
  const copy = getCatalogCopy(locale);
  const productHref = detailHref ?? `/cabinet/catalog/${product.slug}`;
  const image = <CatalogCardImage alt={product.name} priority={imagePriority} sizes="(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) 50vw, (max-width: 1279px) 33vw, (max-width: 1535px) 25vw, 20vw" src={product.imageUrl} />;
  const imageLink = analyticsSurface
    ? <BehaviorTrackedLink className="absolute inset-0 block bg-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600" eventName={analyticsEventName} href={productHref} productId={product.id} sourceSurface={analyticsSurface}>{image}</BehaviorTrackedLink>
    : <Link className="absolute inset-0 block bg-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600" href={productHref} prefetch={false}>{image}</Link>;
  const imageActions = capabilities.canManagePurchasingLists || (companyId && userId) ? (
    <div
      aria-label={locale === "ro" ? "Acțiuni produs" : "Действия с товаром"}
      className="absolute right-2 top-2 z-20 flex flex-col gap-1.5"
      data-product-card-image-actions
    >
      {capabilities.canManagePurchasingLists ? <FavoriteProductButton compact initialSaved={favorite} productId={product.id} /> : null}
      {companyId && userId ? <ProductComparisonAction categoryId={product.category?.id ?? null} companyId={companyId} compact productId={product.id} userId={userId} /> : null}
    </div>
  ) : null;
  const media = (
    <div className="relative aspect-[4/3] overflow-hidden bg-zinc-100" data-product-card-media>
      {imageLink}
      {contextBadge || product.merchandisingLabels?.length ? <MerchandisingBadgeOverlay reserveImageActions={Boolean(imageActions)}>
        {contextBadge ? <MerchandisingBadge label={contextBadge} variant={contextBadgeVariant} /> : <MerchandisingBadges labelOverrides={{ HOT: copy.hot, NEW: copy.new, SPECIAL_OFFER: copy.special, TOP: copy.top }} labels={product.merchandisingLabels ?? []} productCollectionsLabel={copy.productCollections} />}
      </MerchandisingBadgeOverlay> : null}
      {imageActions}
    </div>
  );

  return <CatalogProductCardFrame
    actions={capabilities.canAddToOrder ? <CatalogQuantityCartAction productId={product.id} selectionProduct={toLiveCommerceSelectionProduct({ ...product, commercialView })} sourceSurface={analyticsSurface} successEventName={cartSuccessEventName} /> : <Link className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-emerald-700 text-sm font-semibold text-emerald-700" href={productHref} prefetch={false}>{copy.details}</Link>}
    availability={capabilities.showStock ? <ProductAvailabilityBlock locale={locale} stock={commercialView?.stock} /> : null}
    commercial={capabilities.showPrice ? <ProductPricingBlock commercialView={commercialView} locale={locale} showPartnerPrice={capabilities.showPartnerPrice} showRetailPrice={variant === "cobuy" ? false : capabilities.showRetailPrice} /> : null}
    context={contextLine ? <p className="line-clamp-2 min-h-8 text-xs text-zinc-500">{contextLine}</p> : null}
    media={media}
    metadata={<p className="truncate text-[11px] font-medium uppercase text-zinc-500" title={`SKU ${product.sku}`}>SKU {product.sku}</p>}
    title={<Link className="line-clamp-2 h-10 rounded-sm text-sm font-semibold leading-5 text-zinc-950 outline-none hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500" href={productHref} prefetch={false} title={product.name}>{product.name}</Link>}
    density={variant === "cobuy" ? "compact" : "comfortable"}
  />;
}

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
import { MerchandisingBadges } from "./MerchandisingBadges";
import { BehaviorTrackedLink } from "../../behavior-analytics/components";

type ProductCardProps = { product: CatalogProductCardDto; analyticsSurface?: string; commercialView?: ProductCommercialViewDto; capabilities: ProductCardCapabilityModel; companyId?: string | null; favorite?: boolean; imagePriority?: boolean; userId?: string | null };

export function ProductCard({ analyticsSurface, capabilities, commercialView, companyId = null, favorite = false, imagePriority = false, product, userId = null }: ProductCardProps) {
  const image = <>
    <CatalogCardImage alt={product.name} priority={imagePriority} sizes="(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) 50vw, (max-width: 1279px) 33vw, (max-width: 1535px) 25vw, 20vw" src={product.imageUrl} />
    {product.merchandisingLabels?.length ? <div className="pointer-events-none absolute left-2 top-2 z-10 max-w-[calc(100%-1rem)] drop-shadow-sm">
      <MerchandisingBadges labels={product.merchandisingLabels} />
    </div> : null}
  </>;

  return <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm">
    {analyticsSurface ? <BehaviorTrackedLink className="relative block aspect-[4/3] overflow-hidden bg-zinc-100" href={`/cabinet/catalog/${product.slug}`} productId={product.id} sourceSurface={analyticsSurface}>{image}</BehaviorTrackedLink> : <Link className="relative block aspect-[4/3] overflow-hidden bg-zinc-100" href={`/cabinet/catalog/${product.slug}`} prefetch={false}>{image}</Link>}
    <div className="flex flex-1 flex-col p-3">
      <p className="h-4 truncate text-[11px] font-medium uppercase text-zinc-500" title={`SKU ${product.sku}`}>SKU {product.sku}</p>
      <Link className="mt-1 line-clamp-2 h-10 text-sm font-semibold leading-5 text-zinc-950 hover:text-emerald-700" href={`/cabinet/catalog/${product.slug}`} prefetch={false} title={product.name}>{product.name}</Link>
      <div className="mt-3 grid gap-2 text-sm">
        <div className="h-[5.25rem]">{capabilities.showPrice ? <ProductPricingBlock commercialView={commercialView} showPartnerPrice={capabilities.showPartnerPrice} showRetailPrice={capabilities.showRetailPrice} /> : null}</div>
        <div className="h-[3.25rem]">
          {capabilities.showStock ? <ProductAvailabilityBlock stock={commercialView?.stock} /> : null}
        </div>
      </div>
      <div className="mt-auto pt-3">
        {capabilities.canAddToOrder ? <CatalogQuantityCartAction productId={product.id} /> : <Link className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-emerald-700 text-sm font-semibold text-emerald-700" href={`/cabinet/catalog/${product.slug}`} prefetch={false}>Подробнее</Link>}
        <div aria-label="Дополнительные действия" className="mt-2 flex min-h-9 justify-end gap-1.5">
          {capabilities.canManagePurchasingLists ? <FavoriteProductButton compact initialSaved={favorite} productId={product.id} withListChooser /> : null}
          {capabilities.canAddToSpecification ? <ProductSpecificationAction compact productId={product.id} /> : null}
          {companyId && userId ? <ProductComparisonAction categoryId={product.category?.id ?? null} companyId={companyId} compact productId={product.id} userId={userId} /> : null}
        </div>
      </div>
    </div>
  </article>;
}

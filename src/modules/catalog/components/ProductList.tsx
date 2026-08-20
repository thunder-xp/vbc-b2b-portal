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

export function ProductList({ capabilities, commercialViews = {}, companyId, contextBadge, favoriteProductIds = [], products, userId }: {
  capabilities: ProductCardCapabilityModel;
  commercialViews?: Record<string, ProductCommercialViewDto>;
  companyId: string | null;
  contextBadge?: string;
  favoriteProductIds?: string[];
  products: CatalogProductCardDto[];
  userId: string | null;
}) {
  const favorites = new Set(favoriteProductIds);
  return <div className="divide-y divide-zinc-200 overflow-hidden rounded-md border border-zinc-200 bg-white">
    {products.map((product, index) => {
      const commercialView = commercialViews[product.id];
      return <article className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-3 p-3 md:grid-cols-[72px_minmax(180px,1fr)_minmax(190px,0.8fr)_minmax(150px,0.6fr)_auto] md:items-center" key={product.id}>
        <Link className="relative aspect-square overflow-hidden rounded bg-zinc-100" href={`/cabinet/catalog/${product.slug}`} prefetch={false}>
          <CatalogCardImage alt={product.name} priority={index === 0} sizes="(max-width: 767px) 64px, 72px" src={product.imageUrl} />
          {contextBadge || product.merchandisingLabels?.length ? <MerchandisingBadgeOverlay>{contextBadge ? <MerchandisingBadge label={contextBadge} variant="REPLENISHMENT" /> : <MerchandisingBadges labels={product.merchandisingLabels} />}</MerchandisingBadgeOverlay> : null}
        </Link>
        <div className="min-w-0"><p className="text-[11px] font-medium uppercase text-zinc-500">SKU {product.sku}</p><Link className="mt-0.5 line-clamp-2 text-sm font-semibold leading-5 text-zinc-950 hover:text-emerald-700" href={`/cabinet/catalog/${product.slug}`} prefetch={false} title={product.name}>{product.name}</Link></div>
        {capabilities.showPrice ? <div className="col-span-2 h-[5.25rem] md:col-span-1"><ProductPricingBlock commercialView={commercialView} showPartnerPrice={capabilities.showPartnerPrice} showRetailPrice={capabilities.showRetailPrice} /></div> : null}
        {capabilities.showStock ? <div className="col-span-2 h-[3.25rem] min-w-0 md:col-span-1"><ProductAvailabilityBlock stock={commercialView?.stock} /></div> : null}
        <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 md:col-span-1">
          {capabilities.canAddToOrder ? <CatalogQuantityCartAction productId={product.id} /> : null}
          {capabilities.canManagePurchasingLists ? <FavoriteProductButton compact initialSaved={favorites.has(product.id)} productId={product.id} withListChooser /> : null}
          {capabilities.canAddToSpecification ? <ProductSpecificationAction compact productId={product.id} /> : null}
          {companyId && userId ? <ProductComparisonAction categoryId={product.category?.id ?? null} companyId={companyId} compact productId={product.id} userId={userId} /> : null}
        </div>
      </article>;
    })}
  </div>;
}

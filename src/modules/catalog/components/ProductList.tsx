import Link from "next/link";

import type { ProductCardCapabilityModel } from "../../partner-cabinet/services";
import type { ProductCommercialViewDto } from "../../pricing-inventory";
import type { MerchandisingLabelCode } from "../../merchandising/types";
import { FavoriteProductButton } from "../../purchasing-lists/components/FavoriteProductButton";
import type { CatalogProductCardDto, CatalogQuickLinkCode } from "../services";
import { getCatalogCharacteristicFilterTarget } from "../services/catalog-characteristic-filter";
import { updateCatalogFacetSelection } from "../services/catalog-facet-state";
import { buildCatalogHref } from "../services/catalog-sort-state";
import { buildCatalogProductHref } from "../services/catalog-return-target";
import type { CatalogSort } from "../services/catalog-sorting";
import type { CatalogCollection } from "../types";
import { CatalogCardImage } from "./CatalogCardImage";
import { CatalogQuantityCartAction } from "./CatalogQuantityCartAction";
import { ProductPricingBlock } from "./ProductPricingBlock";
import { ProductAvailabilityBlock } from "./ProductAvailabilityBlock";
import { ProductComparisonAction } from "./ProductComparisonAction";
import { ProductSpecificationAction } from "./ProductSpecificationAction";
import { MerchandisingBadge, MerchandisingBadgeOverlay } from "./MerchandisingBadges";
import { ProductListMerchandisingBadges } from "./ProductListMerchandisingBadges";
import { getCatalogCopy, type PartnerLocale } from "../../partner-locale";
import { toLiveCommerceSelectionProduct } from "../services/live-commerce-selection";

export type ProductListCatalogState = {
  attributeFilters: Record<string, string[]>;
  availability: "all" | "in_stock" | "expected";
  brandId?: string;
  categoryId?: string;
  categorySet?: CatalogQuickLinkCode;
  collection?: CatalogCollection;
  explicitAll: boolean;
  merchandisingLabel?: MerchandisingLabelCode;
  page: number;
  search?: string;
  sort: CatalogSort;
};

export function ProductList({ capabilities, catalogState, commercialViews = {}, companyId, contextBadge, favoriteProductIds = [], locale = "ru", products, userId }: {
  capabilities: ProductCardCapabilityModel;
  catalogState: ProductListCatalogState;
  commercialViews?: Record<string, ProductCommercialViewDto>;
  companyId: string | null;
  contextBadge?: string;
  favoriteProductIds?: string[];
  locale?: PartnerLocale;
  products: CatalogProductCardDto[];
  userId: string | null;
}) {
  const copy = getCatalogCopy(locale);
  const favorites = new Set(favoriteProductIds);
  const returnTarget = buildCatalogHref(catalogState);
  return <div className="divide-y divide-zinc-200 overflow-hidden rounded-md border border-zinc-200 bg-white">
    {products.map((product, index) => {
      const commercialView = commercialViews[product.id];
      const characteristicChips = product.keyCharacteristics.flatMap((characteristic) => {
        const target = getCatalogCharacteristicFilterTarget(characteristic);
        return target ? [{ characteristic, target }] : [];
      }).slice(0, 5);
      const productHref = buildCatalogProductHref(product.slug, returnTarget);
      return <article className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-2.5 p-2.5 xl:items-center xl:max-[1439px]:grid-cols-[64px_minmax(180px,1fr)_minmax(140px,0.65fr)_minmax(120px,0.5fr)] min-[1440px]:grid-cols-[64px_minmax(6rem,1fr)_minmax(7.5rem,0.62fr)_minmax(6.5rem,0.5fr)_minmax(21.75rem,auto)]" key={product.id}>
        <Link className="relative size-16 self-center overflow-hidden rounded bg-zinc-100" href={productHref} prefetch={false}>
          <span className="absolute inset-1">
            <CatalogCardImage alt={product.name} priority={index === 0} sizes="56px" src={product.imageUrl} />
            {contextBadge || product.merchandisingLabels?.length ? <MerchandisingBadgeOverlay>{contextBadge ? <MerchandisingBadge label={contextBadge} variant="REPLENISHMENT" /> : <ProductListMerchandisingBadges labelOverrides={{ HOT: copy.hot, NEW: copy.new, TOP: copy.top }} labels={product.merchandisingLabels} productCollectionsLabel={copy.productCollections} />}</MerchandisingBadgeOverlay> : null}
          </span>
        </Link>
        <div className="min-w-0 self-center"><p className="text-[11px] font-medium uppercase text-zinc-500">SKU {product.sku}</p><Link className="mt-0.5 line-clamp-2 text-sm font-semibold leading-5 text-zinc-950 hover:text-emerald-700" href={productHref} prefetch={false} title={product.name}>{product.name}</Link></div>
        {capabilities.showPrice ? <div className="col-span-2 flex h-16 items-center overflow-hidden rounded-md xl:col-span-1 min-[1440px]:row-start-1"><ProductPricingBlock commercialView={commercialView} locale={locale} showPartnerPrice={capabilities.showPartnerPrice} showRetailPrice={capabilities.showRetailPrice} variant="list" /></div> : null}
        {capabilities.showStock ? <div className="col-span-2 flex h-16 min-w-0 items-center overflow-hidden rounded-md xl:col-span-1 min-[1440px]:row-start-1"><ProductAvailabilityBlock locale={locale} stock={commercialView?.stock} /></div> : null}
        {characteristicChips.length ? <ul aria-label={copy.characteristics} className="col-span-2 flex min-w-0 flex-nowrap gap-1 overflow-hidden xl:col-span-3 xl:col-start-2 min-[1440px]:col-span-4 min-[1440px]:row-start-2" data-testid="catalog-list-characteristics">{characteristicChips.map(({ characteristic, target }) => <li className="min-w-0 shrink" key={`${target.key}:${target.value}`}><Link aria-label={`${characteristic.label}: ${characteristic.value}`} className="block max-w-28 truncate whitespace-nowrap rounded-sm border border-zinc-200 bg-zinc-50 px-1.5 text-[11px] leading-[18px] text-zinc-600 hover:border-emerald-600 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-600" href={buildCatalogHref({ ...catalogState, attributeFilters: updateCatalogFacetSelection(catalogState.attributeFilters, target.key, target.value, "include"), page: 1 })} prefetch={false} title={`${characteristic.label}: ${characteristic.value}`}>{characteristic.value}</Link></li>)}</ul> : null}
        <div className="col-span-2 flex min-h-11 flex-wrap items-center justify-end gap-2 xl:max-[1439px]:col-span-4 min-[1440px]:col-span-1 min-[1440px]:row-start-1 min-[1440px]:h-16 min-[1440px]:flex-nowrap" data-testid="catalog-list-actions">
          {capabilities.canAddToOrder ? <CatalogQuantityCartAction productId={product.id} selectionProduct={toLiveCommerceSelectionProduct({ ...product, commercialView })} /> : null}
          {capabilities.canManagePurchasingLists ? <FavoriteProductButton compact initialSaved={favorites.has(product.id)} productId={product.id} withListChooser /> : null}
          {capabilities.canAddToSpecification ? <ProductSpecificationAction compact productId={product.id} /> : null}
          {companyId && userId ? <ProductComparisonAction categoryId={product.category?.id ?? null} companyId={companyId} compact productId={product.id} userId={userId} /> : null}
        </div>
      </article>;
    })}
  </div>;
}

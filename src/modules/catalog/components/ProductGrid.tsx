import type { ProductCommercialViewDto } from "../../pricing-inventory";
import type { ProductCardCapabilityModel } from "../../partner-cabinet/services";
import type { CatalogProductCardDto } from "../services";
import type { PartnerLocale } from "../../partner-locale";
import { buildCatalogHref, buildCatalogProductHref } from "../services";

import { ProductCard } from "./ProductCard";
import { CatalogProductGridFrame, CATALOG_PRODUCT_GRID_CLASS } from "./CatalogPresentationPrimitives";
import type { ProductListCatalogState } from "./ProductList";

type ProductGridProps = {
  commercialViews?: Record<string, ProductCommercialViewDto>;
  capabilities: ProductCardCapabilityModel;
  catalogState: ProductListCatalogState;
  companyId: string | null;
  contextBadge?: string;
  favoriteProductIds?: string[];
  locale?: PartnerLocale;
  products: CatalogProductCardDto[];
  userId: string | null;
};

export { CATALOG_PRODUCT_GRID_CLASS };

export function ProductGrid({ capabilities, catalogState, commercialViews = {}, companyId, contextBadge, favoriteProductIds = [], locale = "ru", products, userId }: ProductGridProps) {
  const favorites = new Set(favoriteProductIds);
  const returnTarget = buildCatalogHref(catalogState);
  return (
    <CatalogProductGridFrame>
      {products.map((product, index) => (
        <ProductCard
          commercialView={commercialViews[product.id]}
          capabilities={capabilities}
          companyId={companyId}
          contextBadge={contextBadge}
          detailHref={buildCatalogProductHref(product.slug, returnTarget)}
          favorite={favorites.has(product.id)}
          key={product.id}
          imagePriority={index === 0}
          locale={locale}
          product={product}
          userId={userId}
        />
      ))}
    </CatalogProductGridFrame>
  );
}

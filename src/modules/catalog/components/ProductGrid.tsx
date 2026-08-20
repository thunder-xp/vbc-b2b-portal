import type { ProductCommercialViewDto } from "../../pricing-inventory";
import type { ProductCardCapabilityModel } from "../../partner-cabinet/services";
import type { CatalogProductCardDto } from "../services";

import { ProductCard } from "./ProductCard";
import { CatalogProductGridFrame, CATALOG_PRODUCT_GRID_CLASS } from "./CatalogPresentationPrimitives";

type ProductGridProps = {
  commercialViews?: Record<string, ProductCommercialViewDto>;
  capabilities: ProductCardCapabilityModel;
  companyId: string | null;
  contextBadge?: string;
  favoriteProductIds?: string[];
  products: CatalogProductCardDto[];
  userId: string | null;
};

export { CATALOG_PRODUCT_GRID_CLASS };

export function ProductGrid({ capabilities, commercialViews = {}, companyId, contextBadge, favoriteProductIds = [], products, userId }: ProductGridProps) {
  const favorites = new Set(favoriteProductIds);
  return (
    <CatalogProductGridFrame>
      {products.map((product, index) => (
        <ProductCard
          commercialView={commercialViews[product.id]}
          capabilities={capabilities}
          companyId={companyId}
          contextBadge={contextBadge}
          favorite={favorites.has(product.id)}
          key={product.id}
          imagePriority={index === 0}
          product={product}
          userId={userId}
        />
      ))}
    </CatalogProductGridFrame>
  );
}

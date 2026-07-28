import type { ProductCommercialViewDto } from "../../pricing-inventory";
import type { ProductCardCapabilityModel } from "../../partner-cabinet/services";
import type { CatalogProductCardDto } from "../services";

import { ProductCard } from "./ProductCard";

type ProductGridProps = {
  commercialViews?: Record<string, ProductCommercialViewDto>;
  capabilities: ProductCardCapabilityModel;
  companyId: string | null;
  favoriteProductIds?: string[];
  products: CatalogProductCardDto[];
  userId: string | null;
};

export const CATALOG_PRODUCT_GRID_CLASS =
  "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";

export function ProductGrid({ capabilities, commercialViews = {}, companyId, favoriteProductIds = [], products, userId }: ProductGridProps) {
  const favorites = new Set(favoriteProductIds);
  return (
    <div className={CATALOG_PRODUCT_GRID_CLASS}>
      {products.map((product, index) => (
        <ProductCard
          commercialView={commercialViews[product.id]}
          capabilities={capabilities}
          companyId={companyId}
          favorite={favorites.has(product.id)}
          key={product.id}
          imagePriority={index === 0}
          product={product}
          userId={userId}
        />
      ))}
    </div>
  );
}

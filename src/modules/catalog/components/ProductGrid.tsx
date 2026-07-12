import type { ProductCommercialViewDto } from "../../pricing-inventory";
import type { ProductCardCapabilityModel } from "../../partner-cabinet/services";
import type { CatalogProductCardDto } from "../services";

import { ProductCard } from "./ProductCard";

type ProductGridProps = {
  commercialViews?: Record<string, ProductCommercialViewDto>;
  capabilities: ProductCardCapabilityModel;
  products: CatalogProductCardDto[];
};

export function ProductGrid({ capabilities, commercialViews = {}, products }: ProductGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {products.map((product) => (
        <ProductCard
          commercialView={commercialViews[product.id]}
          capabilities={capabilities}
          key={product.id}
          product={product}
        />
      ))}
    </div>
  );
}

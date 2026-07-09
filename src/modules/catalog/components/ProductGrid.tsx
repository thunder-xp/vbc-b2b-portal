import type { CatalogProductCardDto } from "../services";

import { ProductCard } from "./ProductCard";

type ProductGridProps = {
  products: CatalogProductCardDto[];
};

export function ProductGrid({ products }: ProductGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

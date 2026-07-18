import { AddToCartButton } from "../../orders/components/AddToCartButton";
import { ProductComparisonAction } from "./ProductComparisonAction";
import { ProductFavoriteAction } from "./ProductFavoriteAction";
import { ProductSpecificationAction } from "./ProductSpecificationAction";

export function ProductActions({ canAddToOrder, categoryId, companyId, productId, slug, userId }: { canAddToOrder: boolean; categoryId: string | null; companyId: string | null; productId: string; slug: string; userId: string | null }) {
  return <div aria-label="Действия с товаром" className="mt-5 flex flex-wrap items-start gap-2">
    {canAddToOrder ? <AddToCartButton productId={productId} /> : null}
    <ProductSpecificationAction productId={productId} />
    {companyId && userId ? <ProductComparisonAction categoryId={categoryId} companyId={companyId} productId={productId} userId={userId} /> : null}
    <ProductFavoriteAction productId={productId} slug={slug} />
  </div>;
}

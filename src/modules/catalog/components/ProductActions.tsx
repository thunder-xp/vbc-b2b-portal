import { AddToCartButton } from "../../orders/components/AddToCartButton";
import { AddToPurchasingListButton } from "../../purchasing-lists/components/AddToPurchasingListButton";
import { FavoriteProductButton } from "../../purchasing-lists/components/FavoriteProductButton";
import { ProductComparisonAction } from "./ProductComparisonAction";
import { ProductSpecificationAction } from "./ProductSpecificationAction";

export function ProductActions({ canAddToOrder, canManagePurchasingLists = false, categoryId, companyId, initialFavorite = false, productId, userId }: { canAddToOrder: boolean; canManagePurchasingLists?: boolean; categoryId: string | null; companyId: string | null; initialFavorite?: boolean; productId: string; userId: string | null }) {
  return <div aria-label="Действия с товаром" className="mt-5 flex flex-wrap items-start gap-2">
    {canAddToOrder ? <AddToCartButton productId={productId} /> : null}
    {canManagePurchasingLists ? <FavoriteProductButton initialSaved={initialFavorite} productId={productId} /> : null}
    {canManagePurchasingLists ? <AddToPurchasingListButton productId={productId} /> : null}
    <ProductSpecificationAction productId={productId} />
    {companyId && userId ? <ProductComparisonAction categoryId={categoryId} companyId={companyId} productId={productId} userId={userId} /> : null}
  </div>;
}

import { AddToCartButton } from "../../orders/components/AddToCartButton";
import { FavoriteProductButton } from "../../purchasing-lists/components/FavoriteProductButton";
import { ProductComparisonAction } from "./ProductComparisonAction";
import { ProductSpecificationAction } from "./ProductSpecificationAction";
import { getCatalogCopy, type PartnerLocale } from "../../partner-locale";

export function ProductActions({
  canAddToOrder,
  canManagePurchasingLists = false,
  categoryId,
  companyId,
  initialFavorite = false,
  locale = "ru",
  productId,
  userId,
}: {
  canAddToOrder: boolean;
  canManagePurchasingLists?: boolean;
  categoryId: string | null;
  companyId: string | null;
  initialFavorite?: boolean;
  locale?: PartnerLocale;
  productId: string;
  userId: string | null;
}) {
  const copy = getCatalogCopy(locale);
  return (
    <div
      aria-label={copy.productActions}
      className="mt-5 flex flex-wrap items-end gap-2"
    >
      {canAddToOrder ? <AddToCartButton productId={productId} /> : null}
      <div
        aria-label={copy.additionalActions}
        className="flex flex-wrap items-end gap-2"
      >
        {canManagePurchasingLists ? (
          <FavoriteProductButton
            compact
            initialSaved={initialFavorite}
            productId={productId}
            withListChooser
          />
        ) : null}
        <ProductSpecificationAction compact productId={productId} />
        {companyId && userId ? (
          <ProductComparisonAction
            categoryId={categoryId}
            companyId={companyId}
            compact
            productId={productId}
            userId={userId}
          />
        ) : null}
      </div>
    </div>
  );
}

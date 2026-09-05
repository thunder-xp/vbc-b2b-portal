import type { ProductCommercialViewDto } from "../../pricing-inventory";
import { FavoriteProductButton } from "../../purchasing-lists/components/FavoriteProductButton";
import { ProductComparisonAction } from "./ProductComparisonAction";
import { ProductSpecificationAction } from "./ProductSpecificationAction";
import { getCatalogCopy, type PartnerLocale } from "../../partner-locale";
import type { CatalogProductDetailDto } from "../services";
import { toLiveCommerceSelectionProduct } from "../services/live-commerce-selection";
import { CatalogQuantityCartAction } from "./CatalogQuantityCartAction";

export function ProductActions({
  canAddToOrder,
  canManagePurchasingLists = false,
  categoryId,
  companyId,
  commercialView,
  initialFavorite = false,
  locale = "ru",
  product,
  userId,
}: {
  canAddToOrder: boolean;
  canManagePurchasingLists?: boolean;
  categoryId: string | null;
  companyId: string | null;
  commercialView?: ProductCommercialViewDto;
  initialFavorite?: boolean;
  locale?: PartnerLocale;
  product: CatalogProductDetailDto;
  userId: string | null;
}) {
  const copy = getCatalogCopy(locale);
  return (
    <div
      aria-label={copy.productActions}
      className="mt-3 flex flex-wrap items-end gap-2"
    >
      {canAddToOrder ? <CatalogQuantityCartAction productId={product.id} selectionProduct={toLiveCommerceSelectionProduct({ ...product, commercialView })} sourceSurface="product_detail" /> : null}
      <div
        aria-label={copy.additionalActions}
        className="flex min-h-11 flex-wrap items-center gap-2"
      >
        {canManagePurchasingLists ? (
          <FavoriteProductButton
            compact
            initialSaved={initialFavorite}
            productId={product.id}
            withListChooser
          />
        ) : null}
        <ProductSpecificationAction compact productId={product.id} />
        {companyId && userId ? (
          <ProductComparisonAction
            categoryId={categoryId}
            companyId={companyId}
            compact
            productId={product.id}
            userId={userId}
          />
        ) : null}
      </div>
    </div>
  );
}

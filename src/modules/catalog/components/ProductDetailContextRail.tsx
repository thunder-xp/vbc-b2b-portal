import type { CatalogProductDetailDto } from "../services";
import type { ProductCommercialViewDto } from "../../pricing-inventory";
import { getCatalogCopy, type PartnerLocale } from "../../partner-locale";

import { ProductActions } from "./ProductActions";
import { ProductImageGallery } from "./ProductImageGallery";

export function ProductDetailContextRail({
  canAddToOrder,
  canManagePurchasingLists,
  companyId,
  commercialView,
  initialFavorite,
  locale,
  product,
  userId,
}: {
  canAddToOrder: boolean;
  canManagePurchasingLists: boolean;
  companyId: string | null;
  commercialView?: ProductCommercialViewDto;
  initialFavorite: boolean;
  locale: PartnerLocale;
  product: CatalogProductDetailDto;
  userId: string | null;
}) {
  const copy = getCatalogCopy(locale);
  const titleId = `product-${product.id}-title`;

  return (
    <aside
      aria-labelledby={titleId}
      className="min-w-0"
      data-testid="product-detail-context"
    >
      <div data-testid="product-detail-image">
        <ProductImageGallery
          fallbackImageUrl={product.imageUrl}
          images={product.images}
          locale={locale}
          merchandisingLabels={product.merchandisingLabels}
          productId={product.id}
          productName={product.name}
        />
      </div>
      <div className="mt-4 min-w-0">
        <h1
          className="break-words text-xl font-semibold leading-7 text-zinc-950"
          id={titleId}
        >
          {product.name}
        </h1>
        <p className="mt-1 text-sm font-medium text-zinc-600">
          {copy.sku}: {product.sku}
        </p>
        {product.brand?.name ? (
          <p className="mt-1 text-sm font-medium text-emerald-700">
            {product.brand.name}
          </p>
        ) : null}
        {companyId || canAddToOrder ? (
          <ProductActions
            canAddToOrder={canAddToOrder}
            canManagePurchasingLists={canManagePurchasingLists}
            categoryId={product.category?.id ?? null}
            companyId={companyId}
            commercialView={commercialView}
            initialFavorite={initialFavorite}
            locale={locale}
            product={product}
            userId={userId}
          />
        ) : null}
      </div>
    </aside>
  );
}

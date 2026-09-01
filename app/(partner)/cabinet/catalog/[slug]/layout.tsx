import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import {
  getCatalogProductDetailByIdAction,
  getCatalogProductRouteIdentityAction,
} from "@/src/modules/catalog/actions/product-page.action";
import { getProductMerchandisingLabelsAction } from "@/src/modules/catalog/actions";
import { EmptyCatalog } from "@/src/modules/catalog/components/EmptyCatalog";
import { ProductDetailShell } from "@/src/modules/catalog/components";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions";
import { listFavoriteProductIdsAction } from "@/src/modules/purchasing-lists/actions";
import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";
import { getCatalogCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function ProductDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, locale] = await Promise.all([params, getPartnerLocale()]);
  const copy = getCatalogCopy(locale);
  const identityResult = await getCatalogProductRouteIdentityAction(slug);

  if (!identityResult.success) {
    return <EmptyCatalog message={identityResult.message} title={copy.productUnavailable} />;
  }
  if (!identityResult.data) notFound();

  const [productResult, workspaceResult, merchandisingResult] = await Promise.all([
    getCatalogProductDetailByIdAction(identityResult.data.id, {
      includeAttributes: false,
      includeDocuments: false,
      includeImages: true,
    }),
    getPartnerWorkspaceContextAction(),
    getProductMerchandisingLabelsAction(identityResult.data.id),
  ]);

  if (!productResult.success) {
    return <EmptyCatalog message={productResult.message} title={copy.productUnavailable} />;
  }
  if (!productResult.data) notFound();

  const product = productResult.data;
  const canAddToOrder = Boolean(
    workspaceResult.success && workspaceResult.data.capabilities.productCard.canAddToOrder,
  );
  const canManagePurchasingLists = Boolean(
    workspaceResult.success && workspaceResult.data.capabilities.productCard.canManagePurchasingLists,
  );
  const favoriteResult = canManagePurchasingLists
    ? await listFavoriteProductIdsAction([product.id])
    : null;

  return (
    <>
      <BehaviorViewEvent
        brandId={product.brand?.id}
        categoryId={product.category?.id}
        dedupeKey={`product:${product.id}`}
        eventName="product_viewed"
        productId={product.id}
        route={`/cabinet/catalog/${product.slug}`}
        sourceSurface="product_detail"
      />
      <ProductDetailShell
        canAddToOrder={canAddToOrder}
        canManagePurchasingLists={canManagePurchasingLists}
        companyId={workspaceResult.success ? workspaceResult.data.companyId : null}
        initialFavorite={Boolean(
          favoriteResult?.success && favoriteResult.data.includes(product.id),
        )}
        locale={locale}
        product={{
          ...product,
          merchandisingLabels: merchandisingResult.success ? merchandisingResult.data : [],
        }}
        showAnalyticsTab={Boolean(
          workspaceResult.success && workspaceResult.data.capabilities.canViewCompetitiveIntelligence,
        )}
        userId={workspaceResult.success ? workspaceResult.data.userId : null}
      >
        {children}
      </ProductDetailShell>
    </>
  );
}

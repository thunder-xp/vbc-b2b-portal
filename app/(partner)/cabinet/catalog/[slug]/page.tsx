import { notFound } from "next/navigation";

import { getCatalogProductDetailByIdAction, getCatalogProductRouteIdentityAction } from "@/src/modules/catalog/actions/product-page.action";
import { getProductMerchandisingLabelsAction } from "@/src/modules/catalog/actions";
import { EmptyCatalog } from "@/src/modules/catalog/components/EmptyCatalog";
import { ProductDetail, type ProductDetailTab } from "@/src/modules/catalog/components/ProductDetail";
import { evaluateFreshness } from "@/src/modules/integration/freshness";
import { getProductCommercialViewsAction, getRetailPriceHistoryAction } from "@/src/modules/pricing-inventory/actions";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions";
import { listFavoriteProductIdsAction } from "@/src/modules/purchasing-lists/actions";
import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";

type ProductDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<{ tab?: string | string[]; range?: string | string[] }>;
};

export default async function ProductDetailPage({
  params,
  searchParams,
}: ProductDetailPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const activeTab = parseTab(resolvedSearchParams?.tab);
  const historyRange = firstValue(resolvedSearchParams?.range);
  const identityResult = await getCatalogProductRouteIdentityAction(slug);

  if (!identityResult.success) {
    return (
      <EmptyCatalog
        message={identityResult.message}
        title="Product unavailable"
      />
    );
  }

  if (!identityResult.data) {
    notFound();
  }

  const [productResult, commercialViewsResult, workspaceResult, merchandisingResult, retailHistoryResult] = await Promise.all([
    getCatalogProductDetailByIdAction(identityResult.data.id, detailProjection(activeTab)),
    activeTab === "overview" ? getProductCommercialViewsAction([identityResult.data.id]) : Promise.resolve(null),
    activeTab === "overview" ? getPartnerWorkspaceContextAction() : Promise.resolve(null),
    getProductMerchandisingLabelsAction(identityResult.data.id),
    activeTab === "pricing"
      ? getRetailPriceHistoryAction(identityResult.data.id, historyRange)
      : Promise.resolve(null),
  ]);

  if (!productResult.success) return <EmptyCatalog message={productResult.message} title="Product unavailable" />;
  if (!productResult.data) notFound();

  let canAddToOrder = false;
  let canManagePurchasingLists = false;
  let companyId: string | null = null;
  let userId: string | null = null;
  let commercialView;
  let initialFavorite = false;
  if (activeTab === "overview") {
    commercialView = commercialViewsResult?.success ? commercialViewsResult.data[0] : undefined;
    canAddToOrder = Boolean(workspaceResult?.success && workspaceResult.data.capabilities.productCard.canAddToOrder);
    canManagePurchasingLists = Boolean(workspaceResult?.success && workspaceResult.data.capabilities.productCard.canManagePurchasingLists);
    companyId = workspaceResult?.success ? workspaceResult.data.companyId : null;
    userId = workspaceResult?.success ? workspaceResult.data.userId : null;
    if (canManagePurchasingLists) {
      const favoriteResult = await listFavoriteProductIdsAction([productResult.data.id]);
      initialFavorite = Boolean(favoriteResult.success && favoriteResult.data.includes(productResult.data.id));
    }
  }
  const priceUpdatedAt = latestTimestamp([commercialView?.partnerPrice?.lastUpdatedAt, commercialView?.retailPrice?.lastUpdatedAt]);
  const priceFreshness = priceUpdatedAt ? evaluateFreshness(priceUpdatedAt, "price", "Цены") : null;
  const stockFreshness = commercialView?.stock?.lastUpdatedAt ? evaluateFreshness(commercialView.stock.lastUpdatedAt, "stock", "Остатки") : null;

  return (
    <>
      <BehaviorViewEvent
        brandId={productResult.data.brand?.id}
        categoryId={productResult.data.category?.id}
        dedupeKey={`product:${productResult.data.id}`}
        eventName="product_viewed"
        productId={productResult.data.id}
        route={`/cabinet/catalog/${productResult.data.slug}`}
        sourceSurface="product_detail"
      />
      <ProductDetail
      activeTab={activeTab}
      canAddToOrder={canAddToOrder}
      canManagePurchasingLists={canManagePurchasingLists}
      companyId={companyId}
      commercialView={commercialView}
      priceFreshness={priceFreshness}
      initialFavorite={initialFavorite}
      product={{
        ...productResult.data,
        merchandisingLabels: merchandisingResult.success
          ? merchandisingResult.data
          : [],
      }}
      retailPriceHistory={retailHistoryResult?.success ? retailHistoryResult.data : null}
      retailPriceHistoryError={retailHistoryResult && !retailHistoryResult.success ? retailHistoryResult.message : null}
      stockFreshness={stockFreshness}
      userId={userId}
      />
      <BehaviorViewEvent
        dedupeKey={`product-tab:${activeTab}:${productResult.data.id}`}
        eventName={tabViewEvent(activeTab)}
        productId={productResult.data.id}
        route={`/cabinet/catalog/${productResult.data.slug}?tab=${activeTab}`}
        sourceSurface={`product_${activeTab}_tab`}
      />
    </>
  );
}

function parseTab(value: string | string[] | undefined): ProductDetailTab {
  const tab = Array.isArray(value) ? value[0] : value;
  return tab === "description"
    || tab === "characteristics"
    || tab === "datasheet"
    || tab === "pricing"
    ? tab
    : "overview";
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function detailProjection(tab: ProductDetailTab) {
  return {
    includeAttributes: tab === "overview" || tab === "characteristics" || tab === "datasheet",
    includeDocuments: tab === "datasheet",
    includeImages: tab === "overview",
  };
}

function tabViewEvent(tab: ProductDetailTab) {
  switch (tab) {
    case "overview":
      return "product_overview_viewed" as const;
    case "description":
      return "product_description_viewed" as const;
    case "characteristics":
      return "product_characteristics_viewed" as const;
    case "datasheet":
      return "product_datasheet_viewed" as const;
    case "pricing":
      return "product_pricing_tab_viewed" as const;
  }
}

function latestTimestamp(values: Array<string | null | undefined>): string | null {
  const timestamps = values.flatMap((value) => value && Number.isFinite(Date.parse(value)) ? [Date.parse(value)] : []);
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}

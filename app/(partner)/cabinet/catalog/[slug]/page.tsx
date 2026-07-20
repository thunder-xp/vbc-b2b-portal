import { notFound } from "next/navigation";

import { getCatalogProductDetailByIdAction, getCatalogProductRouteIdentityAction } from "@/src/modules/catalog/actions/product-page.action";
import { EmptyCatalog } from "@/src/modules/catalog/components/EmptyCatalog";
import { ProductDetail, type ProductDetailTab } from "@/src/modules/catalog/components/ProductDetail";
import { evaluateFreshness } from "@/src/modules/integration/freshness";
import { getProductCommercialViewsAction } from "@/src/modules/pricing-inventory/actions";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions";

type ProductDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<{ tab?: string | string[] }>;
};

export default async function ProductDetailPage({
  params,
  searchParams,
}: ProductDetailPageProps) {
  const { slug } = await params;
  const activeTab = parseTab((await searchParams)?.tab);
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

  const [productResult, commercialViewsResult, workspaceResult] = await Promise.all([
    getCatalogProductDetailByIdAction(identityResult.data.id),
    activeTab === "description" ? getProductCommercialViewsAction([identityResult.data.id]) : Promise.resolve(null),
    activeTab === "description" ? getPartnerWorkspaceContextAction() : Promise.resolve(null),
  ]);

  if (!productResult.success) return <EmptyCatalog message={productResult.message} title="Product unavailable" />;
  if (!productResult.data) notFound();

  let canAddToOrder = false;
  let canManagePurchasingLists = false;
  let companyId: string | null = null;
  let userId: string | null = null;
  let commercialView;
  if (activeTab === "description") {
    commercialView = commercialViewsResult?.success ? commercialViewsResult.data[0] : undefined;
    canAddToOrder = Boolean(workspaceResult?.success && workspaceResult.data.capabilities.productCard.canAddToOrder);
    canManagePurchasingLists = Boolean(workspaceResult?.success && workspaceResult.data.capabilities.productCard.canManagePurchasingLists);
    companyId = workspaceResult?.success ? workspaceResult.data.companyId : null;
    userId = workspaceResult?.success ? workspaceResult.data.userId : null;
  }
  const priceUpdatedAt = latestTimestamp([commercialView?.partnerPrice?.lastUpdatedAt, commercialView?.retailPrice?.lastUpdatedAt]);
  const priceFreshness = priceUpdatedAt ? evaluateFreshness(priceUpdatedAt, "price", "Цены") : null;
  const stockFreshness = commercialView?.stock?.lastUpdatedAt ? evaluateFreshness(commercialView.stock.lastUpdatedAt, "stock", "Остатки") : null;

  return (
    <ProductDetail
      activeTab={activeTab}
      canAddToOrder={canAddToOrder}
      canManagePurchasingLists={canManagePurchasingLists}
      companyId={companyId}
      commercialView={commercialView}
      priceFreshness={priceFreshness}
      product={productResult.data}
      stockFreshness={stockFreshness}
      userId={userId}
    />
  );
}

function parseTab(value: string | string[] | undefined): ProductDetailTab {
  const tab = Array.isArray(value) ? value[0] : value;
  return tab === "characteristics" || tab === "datasheet" || tab === "pricing" ? tab : "description";
}

function latestTimestamp(values: Array<string | null | undefined>): string | null {
  const timestamps = values.flatMap((value) => value && Number.isFinite(Date.parse(value)) ? [Date.parse(value)] : []);
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}

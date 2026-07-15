import { notFound } from "next/navigation";

import { getCatalogProductDetailAction } from "@/src/modules/catalog/actions";
import { EmptyCatalog, ProductDetail, type ProductDetailTab } from "@/src/modules/catalog/components";
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
  const productResult = await getCatalogProductDetailAction(slug);

  if (!productResult.success) {
    return (
      <EmptyCatalog
        message={productResult.message}
        title="Product unavailable"
      />
    );
  }

  if (!productResult.data) {
    notFound();
  }

  let canAddToOrder = false;
  let commercialView;
  if (activeTab === "description") {
    const [commercialViewsResult, workspaceResult] = await Promise.all([
      getProductCommercialViewsAction([productResult.data.id]),
      getPartnerWorkspaceContextAction(),
    ]);
    commercialView = commercialViewsResult.success ? commercialViewsResult.data[0] : undefined;
    canAddToOrder = workspaceResult.success && workspaceResult.data.capabilities.productCard.canAddToOrder;
  }
  const priceUpdatedAt = latestTimestamp([commercialView?.partnerPrice?.lastUpdatedAt, commercialView?.retailPrice?.lastUpdatedAt]);
  const priceFreshness = priceUpdatedAt ? evaluateFreshness(priceUpdatedAt, "price", "Цены") : null;
  const stockFreshness = commercialView?.stock?.lastUpdatedAt ? evaluateFreshness(commercialView.stock.lastUpdatedAt, "stock", "Остатки") : null;

  return (
    <ProductDetail
      activeTab={activeTab}
      canAddToOrder={canAddToOrder}
      commercialView={commercialView}
      priceFreshness={priceFreshness}
      product={productResult.data}
      stockFreshness={stockFreshness}
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

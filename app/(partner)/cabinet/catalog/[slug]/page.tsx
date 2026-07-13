import { notFound } from "next/navigation";

import { getCatalogProductDetailAction } from "@/src/modules/catalog/actions";
import { EmptyCatalog, ProductDetail } from "@/src/modules/catalog/components";
import { getProductCommercialViewsAction } from "@/src/modules/pricing-inventory/actions";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions";

type ProductDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function ProductDetailPage({
  params,
}: ProductDetailPageProps) {
  const { slug } = await params;
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

  const [commercialViewsResult, workspaceResult] = await Promise.all([
    getProductCommercialViewsAction([productResult.data.id]),
    getPartnerWorkspaceContextAction(),
  ]);
  const commercialView = commercialViewsResult.success
    ? commercialViewsResult.data[0]
    : undefined;

  return (
    <ProductDetail
      canAddToOrder={workspaceResult.success && workspaceResult.data.capabilities.productCard.canAddToOrder}
      commercialView={commercialView}
      product={productResult.data}
    />
  );
}

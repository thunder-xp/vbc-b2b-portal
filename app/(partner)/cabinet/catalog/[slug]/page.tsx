import { notFound } from "next/navigation";

import { getCatalogProductDetailAction } from "@/src/modules/catalog/actions";
import { EmptyCatalog, ProductDetail } from "@/src/modules/catalog/components";
import { getProductCommercialViewsAction } from "@/src/modules/pricing-inventory/actions";

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

  const commercialViewsResult = await getProductCommercialViewsAction([
    productResult.data.id,
  ]);
  const commercialView = commercialViewsResult.success
    ? commercialViewsResult.data[0]
    : undefined;

  return (
    <ProductDetail
      commercialView={commercialView}
      product={productResult.data}
    />
  );
}

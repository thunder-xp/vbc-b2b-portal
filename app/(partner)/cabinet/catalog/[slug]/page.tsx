import { notFound } from "next/navigation";

import { getCatalogProductDetailAction } from "@/src/modules/catalog/actions";
import { EmptyCatalog, ProductDetail } from "@/src/modules/catalog/components";

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

  return <ProductDetail product={productResult.data} />;
}

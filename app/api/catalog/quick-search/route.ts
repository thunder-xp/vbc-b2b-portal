import { NextResponse } from "next/server";

import { listCatalogProductsAction } from "@/src/modules/catalog/actions/list-products.action";
import {
  deriveNormalizedModelFallback,
  quickProductMatchKind,
  rankQuickProductResults,
  type QuickProductSearchResultDto,
} from "@/src/modules/catalog/services/quick-product-search";

const RESULT_LIMIT = 8;

export async function GET(request: Request) {
  const startedAt = performance.now();
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 100) return response([], startedAt);

  const direct = await search(query);
  if (!direct.success) {
    return NextResponse.json(
      { success: false, message: direct.message },
      { status: 403, headers: responseHeaders(startedAt) },
    );
  }

  let data = direct.data;
  const fallback = data.products.length === 0 ? deriveNormalizedModelFallback(query) : null;
  if (fallback) {
    const fallbackResult = await search(fallback, 24);
    if (fallbackResult.success) data = fallbackResult.data;
  }

  const commercialByProduct = new Map(
    (data.commercialViews ?? []).map((view) => [view.productId, view]),
  );
  const products: QuickProductSearchResultDto[] = rankQuickProductResults(query, data.products)
    .slice(0, RESULT_LIMIT)
    .map((product) => {
      const commercialView = commercialByProduct.get(product.id);
      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        slug: product.slug,
        imageUrl: product.imageUrl,
        categoryName: product.category?.name ?? null,
        commercialView: commercialView ? {
          partnerPrice: commercialView.partnerPrice,
          partnerPriceMdl: commercialView.partnerPriceMdl,
          stock: commercialView.stock,
        } : null,
        matchKind: quickProductMatchKind(query, product),
      };
    });

  return response(products, startedAt);
}

function search(query: string, pageSize = RESULT_LIMIT) {
  return listCatalogProductsAction({ page: 1, pageSize, search: query, sort: "default" });
}

function response(products: QuickProductSearchResultDto[], startedAt: number) {
  return NextResponse.json(
    { success: true, data: products },
    { headers: responseHeaders(startedAt) },
  );
}

function responseHeaders(startedAt: number) {
  return {
    "Cache-Control": "private, no-store",
    "Server-Timing": `quick-product-search;dur=${(performance.now() - startedAt).toFixed(1)}`,
  };
}

import { NextResponse } from "next/server";

import { listCatalogProductsAction } from "@/src/modules/catalog/actions/list-products.action";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const search = url.searchParams.get("q")?.trim() ?? "";
  const categoryId = url.searchParams.get("category")?.trim() || undefined;
  if (search.length < 2 || search.length > 100) {
    return NextResponse.json({ success: true, data: { products: [], commercialViews: [] } }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const result = await listCatalogProductsAction({ categoryId, search, page: 1, pageSize: 6 });
  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, no-store" },
    status: result.success ? 200 : 400,
  });
}

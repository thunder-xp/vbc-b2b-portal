import { NextResponse } from "next/server";

import { searchCatalogSuggestionsAction } from "@/src/modules/catalog/actions/search-suggestions.action";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const search = url.searchParams.get("q")?.trim() ?? "";
  const categoryId = url.searchParams.get("category")?.trim() || undefined;
  if (search.length < 2 || search.length > 100) {
    return NextResponse.json({ success: true, data: [] }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const suggestions = await searchCatalogSuggestionsAction({ categoryId, query: search });
  return NextResponse.json({ success: true, data: suggestions }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

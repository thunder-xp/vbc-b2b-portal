"use server";

import { emitRequestTotal, measurePerformanceStage } from "@/src/lib/performance/request-diagnostics";
import { getAuthenticatedUserId, createCompanyAccessService } from "../../access-control/actions/service-factory";
import { SupabaseCatalogRepository } from "../repositories/supabase";
import { DefaultCatalogService, type CatalogSearchSuggestionDto } from "../services";

export async function searchCatalogSuggestionsAction(input: {
  query: string;
  categoryId?: string;
}): Promise<CatalogSearchSuggestionDto[]> {
  try {
    const userId = await getAuthenticatedUserId();
    return await measurePerformanceStage("catalog_search", "suggestion_query", () =>
      new DefaultCatalogService(
        new SupabaseCatalogRepository(),
        createCompanyAccessService(),
      ).searchSuggestions(userId, input),
    );
  } finally {
    emitRequestTotal("catalog_search");
  }
}

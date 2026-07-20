"use server";

import {
  type ActionResult,
  failureFromError,
  success,
} from "../../access-control/actions/action-result";
import {
  createCompanyAccessService,
  getAuthenticatedUserId,
} from "../../access-control/actions/service-factory";
import { SupabaseCatalogRepository } from "../repositories/supabase";
import type { CatalogFacetDto, CatalogFacetListInput } from "../services";
import { DefaultCatalogService } from "../services";
import {
  normalizeCatalogAvailability,
  normalizeCatalogFilters,
  normalizeCatalogOptionalText,
} from "./catalog-action-input";
import { measurePerformanceStage } from "@/src/lib/performance/request-diagnostics";

export async function listCatalogFacetsAction(
  input: CatalogFacetListInput,
): Promise<ActionResult<CatalogFacetDto[]>> {
  try {
    const userId = await getAuthenticatedUserId();
    const facets = await measurePerformanceStage("catalog", "catalog_facets", () => new DefaultCatalogService(
      new SupabaseCatalogRepository(),
      createCompanyAccessService(),
    ).listFacets(userId, {
      categoryId: normalizeCatalogOptionalText(input.categoryId),
      brandId: normalizeCatalogOptionalText(input.brandId),
      search: normalizeCatalogOptionalText(input.search),
      availability: normalizeCatalogAvailability(input.availability),
      attributeFilters: normalizeCatalogFilters(input.attributeFilters),
    }));
    return success("Catalog facets loaded.", facets);
  } catch (error) {
    return failureFromError(error);
  }
}

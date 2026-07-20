"use server";

import { type ActionResult, failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import { createCompanyAccessService, getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { SupabaseCatalogRepository } from "../repositories/supabase";
import type { CatalogProductDetailProjection } from "../repositories";
import { DefaultCatalogService, type CatalogProductDetailDto, type CatalogProductRouteIdentityDto } from "../services";
import { measurePerformanceStage } from "@/src/lib/performance/request-diagnostics";

export async function getCatalogProductRouteIdentityAction(slug: string): Promise<ActionResult<CatalogProductRouteIdentityDto | null>> {
  try {
    const normalizedSlug = slug.trim();
    if (!normalizedSlug) return invalidInput("Product slug is required.");
    const userId = await getAuthenticatedUserId();
    const identity = await measurePerformanceStage("product_detail", "route_identity", () =>
      createCatalogService().getProductRouteIdentityBySlug(userId, normalizedSlug),
    );
    return success(identity ? "Catalog product identity loaded." : "Catalog product was not found.", identity);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function getCatalogProductDetailByIdAction(id: string, projection?: CatalogProductDetailProjection): Promise<ActionResult<CatalogProductDetailDto | null>> {
  try {
    const normalizedId = id.trim();
    if (!normalizedId) return invalidInput("Product id is required.");
    const userId = await getAuthenticatedUserId();
    const product = await createCatalogService().getProductDetailById(userId, normalizedId, normalizeProjection(projection));
    return success(product ? "Catalog product loaded." : "Catalog product was not found.", product);
  } catch (error) {
    return failureFromError(error);
  }
}

function normalizeProjection(projection: CatalogProductDetailProjection | undefined): CatalogProductDetailProjection | undefined {
  if (!projection) return undefined;
  return {
    includeAttributes: projection.includeAttributes === true,
    includeDocuments: projection.includeDocuments === true,
    includeImages: projection.includeImages === true,
  };
}

function createCatalogService(): DefaultCatalogService {
  return new DefaultCatalogService(new SupabaseCatalogRepository(), createCompanyAccessService());
}

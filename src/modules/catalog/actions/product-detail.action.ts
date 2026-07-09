"use server";

import {
  type ActionResult,
  failureFromError,
  invalidInput,
  success,
} from "../../access-control/actions/action-result";
import {
  createCompanyAccessService,
  getAuthenticatedUserId,
} from "../../access-control/actions/service-factory";
import { SupabaseCatalogRepository } from "../repositories/supabase";
import type { CatalogProductDetailDto } from "../services";
import { DefaultCatalogService } from "../services";

export async function getCatalogProductDetailAction(
  slug: string,
): Promise<ActionResult<CatalogProductDetailDto | null>> {
  try {
    const normalizedSlug = slug.trim();

    if (!normalizedSlug) {
      return invalidInput("Product slug is required.");
    }

    const userId = await getAuthenticatedUserId();
    const product = await createCatalogService().getProductDetailBySlug(
      userId,
      normalizedSlug,
    );

    return success(
      product ? "Catalog product loaded." : "Catalog product was not found.",
      product,
    );
  } catch (error) {
    return failureFromError(error);
  }
}

function createCatalogService(): DefaultCatalogService {
  return new DefaultCatalogService(
    new SupabaseCatalogRepository(),
    createCompanyAccessService(),
  );
}

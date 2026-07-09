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
import type { CatalogBrandDto } from "../services";
import { DefaultCatalogService } from "../services";

export async function listCatalogBrandsAction(): Promise<
  ActionResult<CatalogBrandDto[]>
> {
  try {
    const userId = await getAuthenticatedUserId();
    const brands = await createCatalogService().listBrands(userId);

    return success("Catalog brands loaded.", brands);
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

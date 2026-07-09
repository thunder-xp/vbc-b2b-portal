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
import type { CatalogCategoryDto } from "../services";
import { DefaultCatalogService } from "../services";

export async function listCatalogCategoriesAction(): Promise<
  ActionResult<CatalogCategoryDto[]>
> {
  try {
    const userId = await getAuthenticatedUserId();
    const categories = await createCatalogService().listCategories(userId);

    return success("Catalog categories loaded.", categories);
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

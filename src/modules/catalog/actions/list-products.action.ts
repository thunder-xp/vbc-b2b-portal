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
import type {
  CatalogProductListInput,
  CatalogProductListResult,
} from "../services";
import { DefaultCatalogService } from "../services";

export async function listCatalogProductsAction(
  input: CatalogProductListInput,
): Promise<ActionResult<CatalogProductListResult>> {
  try {
    const userId = await getAuthenticatedUserId();
    const products = await createCatalogService().listProducts(userId, {
      categoryId: normalizeOptionalText(input.categoryId),
      brandId: normalizeOptionalText(input.brandId),
      search: normalizeOptionalText(input.search),
      page: input.page,
      pageSize: input.pageSize,
      sort: input.sort,
    });

    return success("Catalog products loaded.", products);
  } catch (error) {
    return failureFromError(error);
  }
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function createCatalogService(): DefaultCatalogService {
  return new DefaultCatalogService(
    new SupabaseCatalogRepository(),
    createCompanyAccessService(),
  );
}

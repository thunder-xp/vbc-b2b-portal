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
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import type {
  CatalogProductListInput,
  CatalogProductListResult,
} from "../services";
import { DefaultCatalogService } from "../services";
import {
  normalizeCatalogAvailability,
  normalizeCatalogFilters,
  normalizeCatalogOptionalText,
} from "./catalog-action-input";

export async function listCatalogProductsAction(
  input: CatalogProductListInput,
): Promise<ActionResult<CatalogProductListResult>> {
  try {
    const userId = await getAuthenticatedUserId();
    const availability = normalizeCatalogAvailability(input.availability);
    const pricingInventoryService = createPricingInventoryService();
    const products = await createCatalogService(pricingInventoryService).listProducts(userId, {
      categoryId: normalizeCatalogOptionalText(input.categoryId),
      brandId: normalizeCatalogOptionalText(input.brandId),
      search: normalizeCatalogOptionalText(input.search),
      page: input.page,
      pageSize: input.pageSize,
      sort: input.sort,
      attributeFilters: normalizeCatalogFilters(input.attributeFilters),
      availability,
    });

    return success("Catalog products loaded.", products);
  } catch (error) {
    return failureFromError(error);
  }
}

function createCatalogService(
  pricingInventoryService: ReturnType<typeof createPricingInventoryService>,
): DefaultCatalogService {
  return new DefaultCatalogService(
    new SupabaseCatalogRepository(),
    createCompanyAccessService(),
    pricingInventoryService,
  );
}

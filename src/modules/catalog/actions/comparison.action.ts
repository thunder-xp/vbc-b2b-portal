"use server";

import { failureFromError, invalidInput, success, type ActionResult } from "../../access-control/actions/action-result";
import { createCompanyAccessService, getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import type { ProductCommercialViewDto } from "../../pricing-inventory";
import { SupabaseCatalogRepository } from "../repositories/supabase";
import { DefaultCatalogService, type CatalogProductCardDto } from "../services";

export type CatalogComparisonDto = { products: CatalogProductCardDto[]; commercialViews: ProductCommercialViewDto[] };

export async function getCatalogComparisonAction(productIds: string[]): Promise<ActionResult<CatalogComparisonDto>> {
  const ids = [...new Set(productIds.map((id) => id.trim()))];
  if (!ids.length || ids.length > 4 || ids.some((id) => !isPortalUuid(id))) return invalidInput("Можно сравнить от 1 до 4 товаров.");
  try {
    const userId = await getAuthenticatedUserId();
    const access = createCompanyAccessService();
    const pricing = createPricingInventoryService();
    const products = await new DefaultCatalogService(new SupabaseCatalogRepository(), access).getProductsByIds(userId, ids);
    if (products.length !== ids.length || new Set(products.map((item) => item.category?.id)).size !== 1) return invalidInput("Для сравнения выберите товары одной категории.");
    return success("Comparison loaded.", { products, commercialViews: await pricing.getProductCommercialViews(userId, ids) });
  } catch (error) { return failureFromError(error); }
}

function isPortalUuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

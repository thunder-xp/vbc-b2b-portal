"use server";

import { failureFromError, invalidInput, success, type ActionResult } from "../../access-control/actions/action-result";
import { createCompanyAccessService, getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import { SupabaseCatalogRepository } from "../repositories/supabase";
import { DefaultCatalogService } from "../services";
import { toLiveCommerceSelectionProduct, type LiveCommerceSelectionProduct } from "../services/live-commerce-selection";

export async function refreshLiveCommerceSelectionAction(productIds: string[]): Promise<ActionResult<LiveCommerceSelectionProduct[]>> {
  const ids = [...new Set(Array.isArray(productIds) ? productIds.map((id) => id.trim()).filter(Boolean) : [])];
  if (!ids.length || ids.length > 50) return invalidInput("Select between 1 and 50 products.");
  try {
    const userId = await getAuthenticatedUserId();
    const pricing = createPricingInventoryService();
    const catalog = new DefaultCatalogService(new SupabaseCatalogRepository(), createCompanyAccessService(), pricing);
    const [products, commercialViews] = await Promise.all([
      catalog.getProductsByIds(userId, ids),
      pricing.getProductCommercialViews(userId, ids),
    ]);
    const commercialById = new Map(commercialViews.map((view) => [view.productId, view]));
    const data = products.map((product) => toLiveCommerceSelectionProduct({
      ...product,
      commercialView: commercialById.get(product.id),
    }));
    return success("Live selection refreshed.", data);
  } catch (error) {
    return failureFromError(error);
  }
}

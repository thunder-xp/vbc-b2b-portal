"use server";

import { z } from "zod";

import {
  type ActionResult,
  failureFromError,
  success,
} from "../../access-control/actions/action-result";
import {
  createCompanyAccessService,
  getAuthenticatedUserId,
} from "../../access-control/actions/service-factory";
import { SupabaseCatalogRepository } from "../../catalog/repositories/supabase";
import { DefaultCatalogService } from "../../catalog/services";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import { SupabaseProductCoBuyRepository } from "../repositories/supabase-product-cobuy.repository";
import { ProductCoBuyService } from "../services/product-cobuy.service";
import type { ProductCoBuyCard } from "../types";

const productIdSchema = z.string().uuid();

export async function getProductCoBuyRecommendationsAction(
  sourceProductId: string,
): Promise<ActionResult<ProductCoBuyCard[]>> {
  try {
    const productId = productIdSchema.parse(sourceProductId);
    const userId = await getAuthenticatedUserId();
    const catalog = new DefaultCatalogService(
      new SupabaseCatalogRepository(),
      createCompanyAccessService(),
    );
    const cards = await new ProductCoBuyService(
      new SupabaseProductCoBuyRepository(),
      catalog,
      createPricingInventoryService(),
    ).getRecommendations(userId, productId, 5);
    return success("Product co-buy recommendations loaded.", cards);
  } catch (error) {
    return failureFromError(error);
  }
}

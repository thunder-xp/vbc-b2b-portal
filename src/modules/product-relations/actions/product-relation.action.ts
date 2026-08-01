"use server";

import { z } from "zod";

import { type ActionResult, failureFromError, success } from "../../access-control/actions/action-result";
import { createCompanyAccessService, getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { SupabaseCatalogRepository } from "../../catalog/repositories/supabase";
import { DefaultCatalogService } from "../../catalog/services";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import { SupabaseProductRelationRepository } from "../repositories/supabase-product-relation.repository";
import { ProductRelationService, ProductRelationSummaryService } from "../services/product-relation.service";
import type { ProductRelationSections, ProductRelationSummary } from "../types";

const idSchema = z.string().uuid();

export async function getProductRelationSectionsAction(
  sourceProductId: string,
): Promise<ActionResult<ProductRelationSections>> {
  try {
    const productId = idSchema.parse(sourceProductId);
    const userId = await getAuthenticatedUserId();
    const catalog = new DefaultCatalogService(
      new SupabaseCatalogRepository(),
      createCompanyAccessService(),
    );
    const result = await new ProductRelationService(
      new SupabaseProductRelationRepository(),
      catalog,
      createPricingInventoryService(),
    ).getSections(userId, productId);
    return success("Связанные товары загружены.", result);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function getProductRelationSummaryAction(
  sourceProductId: string,
): Promise<ActionResult<ProductRelationSummary>> {
  try {
    const productId = idSchema.parse(sourceProductId);
    await getAuthenticatedUserId();
    const result = await new ProductRelationSummaryService(
      new SupabaseProductRelationRepository(),
    ).getSummary(productId);
    return success("Сводка связанных товаров загружена.", result);
  } catch (error) {
    return failureFromError(error);
  }
}

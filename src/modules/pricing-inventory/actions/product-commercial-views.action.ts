"use server";

import {
  type ActionResult,
  failureFromError,
  success,
} from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type { ProductCommercialViewDto } from "../services";
import { createPricingInventoryService } from "./service-factory";

export async function getProductCommercialViewsAction(
  productIds: string[],
): Promise<ActionResult<ProductCommercialViewDto[]>> {
  try {
    const userId = await getAuthenticatedUserId();
    const commercialViews =
      await createPricingInventoryService().getProductCommercialViews(
        userId,
        productIds.map((productId) => productId.trim()).filter(Boolean),
      );

    return success("Product price and availability loaded.", commercialViews);
  } catch (error) {
    return failureFromError(error);
  }
}

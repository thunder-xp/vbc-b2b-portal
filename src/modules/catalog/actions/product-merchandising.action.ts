"use server";

import {
  failureFromError,
  success,
  type ActionResult,
} from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { createMerchandisingService } from "../../merchandising/actions";
import type { MerchandisingLabelCode } from "../../merchandising/types";

export async function getProductMerchandisingLabelsAction(
  productId: string,
): Promise<ActionResult<MerchandisingLabelCode[]>> {
  try {
    const userId = await getAuthenticatedUserId();
    const assignments = await createMerchandisingService()
      .listPublishedForProducts(userId, [productId]);
    return success(
      "Product merchandising loaded.",
      assignments.map((assignment) => assignment.labelCode).slice(0, 3),
    );
  } catch (error) {
    return failureFromError(error);
  }
}

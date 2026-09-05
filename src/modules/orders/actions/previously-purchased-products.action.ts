"use server";

import {
  emitRequestTotal,
  measurePerformanceStage,
} from "@/src/lib/performance/request-diagnostics";

import {
  type ActionResult,
  failureFromError,
  success,
} from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type { PreviouslyPurchasedProductDto } from "../services/order-history.service";
import { createPartnerOrderHistoryListService } from "./order-history-list.factory";

export async function listPreviouslyPurchasedProductsAction(input: {
  limit?: number;
  offset?: number;
} = {}): Promise<ActionResult<{
  items: PreviouslyPurchasedProductDto[];
  totalCount: number;
}>> {
  try {
    const userId = await measurePerformanceStage(
      "live-reorder",
      "auth",
      getAuthenticatedUserId,
    );
    const page = await measurePerformanceStage(
      "live-reorder",
      "previously_purchased_products",
      () => createPartnerOrderHistoryListService()
        .listPreviouslyPurchasedProducts(userId, input),
    );
    return success("Previously purchased products loaded.", page);
  } catch (error) {
    return failureFromError(error);
  } finally {
    emitRequestTotal("live-reorder");
  }
}

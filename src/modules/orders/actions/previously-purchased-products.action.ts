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
import type { RollingPeriod } from "../../commerce-period";

export async function listPreviouslyPurchasedProductsAction(input: {
  categoryIds?: string[];
  limit?: number;
  offset?: number;
  period?: RollingPeriod;
  search?: string | null;
} = {}): Promise<ActionResult<{
  categories: Array<{ id: string; external1cId: string | null; parentId: null; name: string; slug: string; productCount: number }>;
  allCount: number;
  items: PreviouslyPurchasedProductDto[];
  totalCount: number;
}>> {
  try {
    const userId = await measurePerformanceStage(
      "repeat-purchase",
      "auth",
      getAuthenticatedUserId,
    );
    const page = await measurePerformanceStage(
      "repeat-purchase",
      "previously_purchased_products",
      () => createPartnerOrderHistoryListService()
        .listPreviouslyPurchasedProducts(userId, input),
    );
    return success("Previously purchased products loaded.", page);
  } catch (error) {
    return failureFromError(error);
  } finally {
    emitRequestTotal("repeat-purchase");
  }
}

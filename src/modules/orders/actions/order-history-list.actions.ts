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
import type { FreshnessView } from "../../integration/freshness";
import type {
  OrderHistoryBootstrapState,
  PartnerOrderHistorySyncState,
} from "../types";
import { OrderHistorySyncError } from "../services/order-history.errors";
import type { PartnerOrderHistorySummaryDto } from "../services/order-history.service";
import { createPartnerOrderHistoryListService } from "./order-history-list.factory";

export async function listPartnerOrderHistoryAction(input: {
  filter?: string | null;
  search?: string | null;
  page?: number | string | null;
} = {}): Promise<ActionResult<{
  orders: PartnerOrderHistorySummaryDto[];
  filter: "all" | "processing" | "open" | "preorder" | "test" | "completed";
  search: string;
  page: number;
  totalPages: number;
  total: number;
  syncState: PartnerOrderHistorySyncState | null;
  bootstrapState: OrderHistoryBootstrapState | null;
  freshness: FreshnessView;
}>> {
  try {
    const userId = await measurePerformanceStage(
      "orders",
      "auth",
      getAuthenticatedUserId,
    );
    const orders = await measurePerformanceStage(
      "orders",
      "order_list",
      () => createPartnerOrderHistoryListService().list(userId, input),
    );
    return success("Order history loaded.", orders);
  } catch (error) {
    if (error instanceof OrderHistorySyncError) {
      return {
        success: false,
        errorCode: error.code,
        message: `Код события: ${error.correlationId}.`,
        data: null,
      };
    }
    return failureFromError(error);
  } finally {
    emitRequestTotal("orders");
  }
}

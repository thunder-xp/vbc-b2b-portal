"use server";

import type { ActionResult } from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type { RetailPriceHistoryRange } from "../repositories";
import type { RetailPriceHistoryDto } from "../services";
import { createPricingInventoryService } from "./service-factory";

const RANGES = new Set<RetailPriceHistoryRange>(["3m", "6m", "12m", "all"]);

export async function getRetailPriceHistoryAction(
  productId: string,
  requestedRange: string | undefined,
): Promise<ActionResult<RetailPriceHistoryDto>> {
  const correlationId = crypto.randomUUID().slice(0, 8).toUpperCase();
  try {
    const userId = await getAuthenticatedUserId();
    const range = RANGES.has(requestedRange as RetailPriceHistoryRange)
      ? requestedRange as RetailPriceHistoryRange
      : "12m";
    const history = await createPricingInventoryService().getRetailPriceHistory?.(
      userId,
      productId.trim(),
      range,
    );
    if (!history) throw new Error("Retail price history service is unavailable.");
    return {
      success: true,
      errorCode: null,
      message: "История розничной цены загружена.",
      data: history,
    };
  } catch (error) {
    console.error({
      event: "retail_price_history_read_failed",
      correlationId,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      errorCode: `RETAIL_HISTORY_${correlationId}`,
      message: `Не удалось загрузить историю цен. Код события: ${correlationId}.`,
      data: null,
    };
  }
}

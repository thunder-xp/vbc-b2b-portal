"use server";

import { z } from "zod";

import { failureFromError, invalidInput, success, type ActionResult } from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type {
  RepeatOrderSelectionBatchDto,
  RepeatOrderSelectionPreviewDto,
  RepeatOrderSummaryDto,
} from "../services/quick-reorder.service";
import { createQuickReorderService } from "./service-factory";

const orderIdSchema = z.string().uuid();
const selectionSchema = z.array(z.object({
  lineId: z.string().uuid(),
  quantity: z.number().int().min(1).max(9999),
})).min(1).max(50);

export async function listRecentRepeatableOrdersAction(): Promise<ActionResult<RepeatOrderSummaryDto[]>> {
  try {
    return success(
      "Recent repeatable orders loaded.",
      await createQuickReorderService().listRecentRepeatableOrders(await getAuthenticatedUserId(), 3),
    );
  } catch (error) {
    return failureFromError(error);
  }
}

export async function getRepeatOrderSelectionPreviewAction(
  orderId: string,
): Promise<ActionResult<RepeatOrderSelectionPreviewDto>> {
  const parsed = orderIdSchema.safeParse(orderId);
  if (!parsed.success) return invalidInput("Invalid order.");
  try {
    return success(
      "Repeat order composition loaded.",
      await createQuickReorderService().previewForSelection(
        await getAuthenticatedUserId(),
        parsed.data,
      ),
    );
  } catch (error) {
    return failureFromError(error);
  }
}

export async function prepareRepeatOrderSelectionAction(input: {
  orderId: string;
  lines: Array<{ lineId: string; quantity: number }>;
}): Promise<ActionResult<RepeatOrderSelectionBatchDto>> {
  const orderId = orderIdSchema.safeParse(input?.orderId);
  const lines = selectionSchema.safeParse(input?.lines);
  if (!orderId.success || !lines.success) return invalidInput("Invalid order selection.");
  try {
    return success(
      "Current products prepared for selection.",
      await createQuickReorderService().prepareSelection(await getAuthenticatedUserId(), {
        orderId: orderId.data,
        lines: lines.data,
      }),
    );
  } catch (error) {
    return failureFromError(error);
  }
}

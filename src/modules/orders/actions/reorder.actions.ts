"use server";

import { failureFromError, success, type ActionResult } from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type { QuickReorderPreviewDto } from "../services";
import { createQuickReorderService } from "./service-factory";

export async function getQuickReorderPreviewAction(orderId: string): Promise<ActionResult<QuickReorderPreviewDto>> {
  try {
    return success("Данные для повторного заказа загружены.", await createQuickReorderService().preview(await getAuthenticatedUserId(), orderId));
  } catch (error) {
    return failureFromError(error);
  }
}

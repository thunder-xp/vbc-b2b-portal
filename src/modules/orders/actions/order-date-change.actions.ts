"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type { InternalOrderDateChangeRecord } from "../repositories";
import type { OrderDateChangeRequest } from "../types";
import { createInternalOrderDateChangeService } from "./service-factory";

export async function listInternalOrderDateChangesAction(): Promise<ActionResult<InternalOrderDateChangeRecord[]>> {
  try { return success("Date-change requests loaded.", await createInternalOrderDateChangeService().listPending(await getAuthenticatedUserId())); }
  catch (error) { return failureFromError(error); }
}

export async function reviewOrderDateChangeAction(input: { requestId: string; decision: "approved" | "rejected"; comment: string }): Promise<ActionResult<OrderDateChangeRequest>> {
  if (!input.requestId?.trim() || !["approved", "rejected"].includes(input.decision)) return invalidInput("Решение не заполнено.");
  try {
    const request = await createInternalOrderDateChangeService().review(await getAuthenticatedUserId(), input);
    revalidatePath("/admin/reservation-requests");
    revalidatePath("/cabinet/reservation-requests");
    return success(input.decision === "approved" ? "Перенос даты одобрен." : "Перенос даты отклонён.", request);
  } catch (error) { return failureFromError(error); }
}

"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type { PartnerOrderDetailDto, PartnerOrderSummaryDto } from "../services";
import type { PartnerOrder } from "../types";
import { createPartnerOrderService } from "./service-factory";
import { orderSubmissionFailure } from "./order-action-error";

export async function submitCartOrderAction(
  _state: ActionResult<PartnerOrder | null>,
  formData: FormData,
): Promise<ActionResult<PartnerOrder | null>> {
  const submissionKey = text(formData, "submissionKey");
  const requestedDeliveryDate = text(formData, "requestedDeliveryDate");
  if (!submissionKey || !requestedDeliveryDate) return invalidInput("Укажите дату отгрузки.");
  try {
    const order = await createPartnerOrderService().submit(await getAuthenticatedUserId(), { submissionKey, requestedDeliveryDate });
    revalidatePath("/cabinet", "layout"); revalidatePath("/cabinet/cart"); revalidatePath("/cabinet/orders");
    return success(`Заказ ${order.external1cNumber ?? ""} создан в 1С.`, order);
  } catch (error) { return orderSubmissionFailure(error) ?? failureFromError(error); }
}

export async function listPartnerOrdersAction(): Promise<ActionResult<PartnerOrderSummaryDto[]>> {
  try { return success("Orders loaded.", await createPartnerOrderService().listOwnCompanyOrders(await getAuthenticatedUserId())); }
  catch (error) { return failureFromError(error); }
}

export async function getPartnerOrderAction(orderId: string): Promise<ActionResult<PartnerOrderDetailDto>> {
  try { return success("Order loaded.", await createPartnerOrderService().getOrder(await getAuthenticatedUserId(), orderId)); }
  catch (error) { return failureFromError(error); }
}

function text(formData: FormData, key: string): string { const value = formData.get(key); return typeof value === "string" ? value.trim() : ""; }

"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import { createUserProfileService, getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { ForbiddenError } from "../../access-control/services";
import { UserType } from "../../access-control/types";
import { OrderHistorySyncError, type PartnerOrderHistoryDetailDto, type PartnerOrderHistorySummaryDto, type PartnerOrderHistorySyncResult, type PartnerOrderDetailDto, type PartnerOrderSummaryDto, type PlannedShipmentDto } from "../services";
import type { PartnerOrder } from "../types";
import { createPartnerOrderHistoryService, createPartnerOrderService } from "./service-factory";
import { orderSubmissionFailure } from "./order-action-error";

export async function submitCartOrderAction(
  _state: ActionResult<PartnerOrderSubmissionReceipt | null>,
  formData: FormData,
): Promise<ActionResult<PartnerOrderSubmissionReceipt | null>> {
  const cartId = text(formData, "cartId");
  const expectedIntentVersion = Number(text(formData, "expectedIntentVersion"));
  const submissionKey = text(formData, "submissionKey");
  const requestedDeliveryDate = text(formData, "requestedDeliveryDate");
  if (
    !cartId
    || !Number.isSafeInteger(expectedIntentVersion)
    || expectedIntentVersion < 1
    || !submissionKey
    || !requestedDeliveryDate
  ) {
    return invalidInput("Проверьте корзину и дату отгрузки.");
  }
  try {
    const order = await createPartnerOrderService().submit(
      await getAuthenticatedUserId(),
      { cartId, expectedIntentVersion, submissionKey, requestedDeliveryDate },
    );
    revalidatePath("/cabinet", "layout"); revalidatePath("/cabinet/cart"); revalidatePath("/cabinet/orders");
    return success(`Заказ ${order.external1cNumber ?? ""} создан в 1С.`, {
      id: order.id,
      external1cNumber: order.external1cNumber,
      status: order.status,
    });
  } catch (error) {
    const failure = orderSubmissionFailure(error) ?? failureFromError(error);
    if (failure.errorCode === "ORDER_PRICE_CHANGED") {
      revalidatePath("/cabinet/cart");
    }
    return failure;
  }
}

export type PartnerOrderSubmissionReceipt = Pick<
  PartnerOrder,
  "id" | "external1cNumber" | "status"
>;

export async function listPartnerOrdersAction(): Promise<ActionResult<PartnerOrderSummaryDto[]>> {
  try { return success("Orders loaded.", await createPartnerOrderService().listOwnCompanyOrders(await getAuthenticatedUserId())); }
  catch (error) { return failureFromError(error); }
}

export async function getPartnerOrderAction(orderId: string): Promise<ActionResult<PartnerOrderDetailDto>> {
  try { return success("Order loaded.", await createPartnerOrderService().getOrder(await getAuthenticatedUserId(), orderId)); }
  catch (error) { return failureFromError(error); }
}

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
  syncState: import("../types").PartnerOrderHistorySyncState | null;
  freshness: import("../../integration/freshness").FreshnessView;
}>> {
  try {
    return success("Order history loaded.", await createPartnerOrderHistoryService().list(await getAuthenticatedUserId(), input));
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
  }
}

export async function getPartnerOrderHistoryAction(orderId: string): Promise<ActionResult<PartnerOrderHistoryDetailDto>> {
  try {
    return success("Order history loaded.", await createPartnerOrderHistoryService().get(await getAuthenticatedUserId(), orderId));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function listPlannedShipmentsAction(input: { page?: number | string | null } = {}): Promise<ActionResult<{ shipments: PlannedShipmentDto[]; page: number; totalPages: number; total: number }>> {
  try {
    return success("Planned shipments loaded.", await createPartnerOrderHistoryService().listPlannedShipments(await getAuthenticatedUserId(), input));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function createOrderDateChangeRequestAction(
  _state: ActionResult<import("../types").OrderDateChangeRequest | null>,
  formData: FormData,
): Promise<ActionResult<import("../types").OrderDateChangeRequest | null>> {
  const orderHistoryId = text(formData, "orderHistoryId");
  const requestedDate = text(formData, "requestedDate");
  if (!orderHistoryId || !requestedDate) return invalidInput("Укажите новую дату отгрузки.");
  try {
    const request = await createPartnerOrderHistoryService().createDateChangeRequest(
      await getAuthenticatedUserId(), orderHistoryId, requestedDate, text(formData, "comment"),
    );
    revalidatePath("/cabinet/reservation-requests");
    return success("Запрос на перенос даты отправлен.", request);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function cancelOrderDateChangeRequestAction(requestId: string): Promise<ActionResult<import("../types").OrderDateChangeRequest>> {
  try {
    const request = await createPartnerOrderHistoryService().cancelDateChangeRequest(await getAuthenticatedUserId(), requestId);
    revalidatePath("/cabinet/reservation-requests");
    return success("Запрос отменён.", request);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function refreshPartnerOrderHistoryAction(): Promise<ActionResult<PartnerOrderHistorySyncResult>> {
  try {
    const result = await createPartnerOrderHistoryService().syncOwnCompany(await getAuthenticatedUserId(), "incremental");
    revalidatePath("/cabinet/orders");
    revalidatePath("/cabinet/orders/[id]", "page");
    return success("История заказов обновлена.", result);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function reconcilePartnerOrderAction(orderId: string): Promise<ActionResult<PartnerOrder>> {
  try {
    const userId = await getAuthenticatedUserId();
    const profile = await createUserProfileService().ensureActiveUser(userId);
    if (profile.userType !== UserType.Internal && profile.userType !== UserType.Admin) throw new ForbiddenError();
    const order = await createPartnerOrderService().reconcileInternal(orderId);
    revalidatePath("/cabinet/orders");
    revalidatePath(`/cabinet/orders/${order.id}`);
    return success("Статус заказа уточнён.", order);
  } catch (error) {
    return failureFromError(error);
  }
}

function text(formData: FormData, key: string): string { const value = formData.get(key); return typeof value === "string" ? value.trim() : ""; }

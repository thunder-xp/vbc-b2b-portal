"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "../../access-control/actions/action-result";
import { failureFromError, success } from "../../access-control/actions/action-result";
import type { ProposalCustomerResponse, ProposalDeliveryLocale } from "../types";
import { createProposalDeliveryService, getAuthenticatedUserId } from "./service-factory";

export async function sendProposalDeliveryAction(input: {
  versionId: string;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  message?: string;
  locale: ProposalDeliveryLocale;
  expirationDays: number;
  attachPdf: boolean;
  idempotencyKey: string;
}): Promise<ActionResult<{ deliveryId: string; publicUrl: string | null; attachedPdf: boolean }>> {
  try {
    const result = await createProposalDeliveryService().send(await getAuthenticatedUserId(), input);
    revalidatePath(`/cabinet/estimates/${result.estimateId}`);
    return success("Предложение отправлено.", {
      deliveryId: result.deliveryId,
      publicUrl: result.publicUrl,
      attachedPdf: result.attachedPdf,
    });
  } catch (error) {
    console.error({ event: "proposal_delivery_action_failed", errorName: error instanceof Error ? error.name : typeof error });
    return { success: false, errorCode: "PROPOSAL_DELIVERY_FAILED", message: "Письмо не отправлено. Проверьте данные и повторите попытку.", data: null };
  }
}

export async function revokeProposalDeliveryAction(deliveryId: string): Promise<ActionResult<{ deliveryId: string }>> {
  try {
    const result = await createProposalDeliveryService().revoke(await getAuthenticatedUserId(), deliveryId);
    revalidatePath(`/cabinet/estimates/${result.estimateId}`);
    return success("Публичная ссылка отозвана.", { deliveryId: result.id });
  } catch (error) {
    return failureFromError(error);
  }
}

export async function submitPublicProposalResponseAction(
  token: string,
  response: ProposalCustomerResponse,
  name = "",
  note = "",
): Promise<ActionResult<{ response: ProposalCustomerResponse; respondedAt: string }>> {
  try {
    const result = await createProposalDeliveryService().respond(token, response, name, note);
    return success(response === "accepted" ? "Предложение принято." : "Ответ отправлен.", {
      response: result.response,
      respondedAt: result.respondedAt,
    });
  } catch (error) {
    console.error({ event: "proposal_customer_response_action_failed", errorName: error instanceof Error ? error.name : typeof error });
    return { success: false, errorCode: "PROPOSAL_RESPONSE_FAILED", message: "Не удалось сохранить ответ. Обновите страницу и повторите попытку.", data: null };
  }
}

"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, failureFromError, success } from "../../access-control/actions/action-result";
import type { Estimate, EstimateCartConversionSummary, EstimateSentChannel, EstimateVersion, EstimateWorkflowDto, ProposalTemplate } from "../types";
import { createEstimateLifecycleService, getAuthenticatedUserId } from "./service-factory";

export async function getEstimateWorkflowAction(estimateId: string): Promise<ActionResult<EstimateWorkflowDto>> {
  try { return success("История версий загружена.", await createEstimateLifecycleService().getWorkflow(await getAuthenticatedUserId(), estimateId)); }
  catch (error) { return failureFromError(error); }
}

export async function createEstimateVersionAction(estimateId: string, expectedRevision: number, note = "", changeReason = ""): Promise<ActionResult<EstimateVersion>> {
  try {
    const result = await createEstimateLifecycleService().createVersion(await getAuthenticatedUserId(), estimateId, expectedRevision, note, changeReason);
    revalidateEstimate(estimateId);
    return success(`Версия ${result.versionNumber} создана.`, result);
  } catch (error) { return failureFromError(error); }
}

export async function markEstimateReadyAction(estimateId: string, expectedRevision: number): Promise<ActionResult<Estimate>> {
  try {
    const result = await createEstimateLifecycleService().markReady(await getAuthenticatedUserId(), estimateId, expectedRevision);
    revalidateEstimate(estimateId);
    return success("Смета отмечена как готовая.", result);
  } catch (error) { return failureFromError(error); }
}

export async function transitionEstimateVersionAction(versionId: string, status: "sent" | "accepted" | "rejected", channel?: EstimateSentChannel | null, note = ""): Promise<ActionResult<EstimateVersion>> {
  try {
    const result = await createEstimateLifecycleService().transitionVersion(await getAuthenticatedUserId(), versionId, status, channel, note);
    revalidateEstimate(result.estimateId);
    return success(status === "sent" ? "Версия отмечена как отправленная." : status === "accepted" ? "Версия отмечена как принятая." : "Версия отмечена как отклонённая.", result);
  } catch (error) { return failureFromError(error); }
}

export async function createDraftFromEstimateVersionAction(versionId: string): Promise<ActionResult<{ estimateId: string }>> {
  try {
    const result = await createEstimateLifecycleService().createDraftFromVersion(await getAuthenticatedUserId(), versionId);
    revalidateEstimate(result.id);
    return success("Новая редакция создана с актуальными товарными ценами.", { estimateId: result.id });
  } catch (error) { return failureFromError(error); }
}

export async function duplicateEstimateAction(estimateId: string): Promise<ActionResult<{ estimateId: string }>> {
  try {
    const result = await createEstimateLifecycleService().duplicateEstimate(await getAuthenticatedUserId(), estimateId);
    revalidatePath("/cabinet/estimates");
    return success("Копия сметы создана.", { estimateId: result.id });
  } catch (error) { return failureFromError(error); }
}

export async function saveEstimateAsTemplateAction(estimateId: string, name: string, includeServiceLines = false): Promise<ActionResult<ProposalTemplate>> {
  try { return success("Шаблон сохранён.", await createEstimateLifecycleService().saveAsTemplate(await getAuthenticatedUserId(), estimateId, name, includeServiceLines)); }
  catch (error) { return failureFromError(error); }
}

export async function createEstimateFromCartAction(name: string, requestKey: string): Promise<ActionResult<{ estimateId: string }>> {
  try {
    const result = await createEstimateLifecycleService().createEstimateFromCart(await getAuthenticatedUserId(), name, requestKey);
    revalidatePath("/cabinet/estimates");
    return success("Смета создана. Корзина сохранена без изменений.", { estimateId: result.id });
  } catch (error) { return failureFromError(error); }
}

export async function addEstimateEquipmentToCartAction(estimateId: string, versionId: string | null, requestKey: string): Promise<ActionResult<EstimateCartConversionSummary>> {
  try {
    const result = await createEstimateLifecycleService().addEquipmentToCart(await getAuthenticatedUserId(), estimateId, versionId, requestKey);
    revalidatePath("/cabinet/cart");
    return success("Оборудование добавлено в корзину по текущим ценам.", result);
  } catch (error) { return failureFromError(error); }
}

function revalidateEstimate(estimateId: string) {
  revalidatePath("/cabinet/estimates");
  revalidatePath(`/cabinet/estimates/${estimateId}`);
}

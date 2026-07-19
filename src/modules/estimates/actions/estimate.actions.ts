"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import type { EstimateCommercialOptionsDto, EstimateDetailDto, EstimateListFilters, EstimateProductPickerDto, EstimateServiceDto, EstimateServiceSelection, SaveEstimateCommercialCommand } from "../services";
import type { EstimateUnit } from "../types";
import { createEstimateService, getAuthenticatedUserId } from "./service-factory";

export type CreateEstimateActionInput = {
  name: string;
  customerName?: string | null;
  projectName?: string | null;
  currencyCode: string;
  validityDays: number;
};

export async function listEstimatesAction(filters: EstimateListFilters = {}) {
  try {
    const userId = await getAuthenticatedUserId();
    return success("Сметы загружены.", await createEstimateService().list(userId, filters));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function listEstimateCurrenciesAction(): Promise<ActionResult<string[]>> {
  try {
    const userId = await getAuthenticatedUserId();
    return success("Валюты загружены.", await createEstimateService().listAvailableCurrencies(userId));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function getEstimateCommercialOptionsAction(): Promise<ActionResult<EstimateCommercialOptionsDto>> {
  try {
    const userId = await getAuthenticatedUserId();
    return success("Коммерческие настройки загружены.", await createEstimateService().getCommercialOptions(userId));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function listEstimateServicesAction(): Promise<ActionResult<EstimateServiceDto[]>> {
  try {
    const userId = await getAuthenticatedUserId();
    return success("Услуги загружены.", await createEstimateService().listServices(userId));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function searchEstimateProductsAction(input: { search?: string; categoryId?: string; brandId?: string }): Promise<ActionResult<EstimateProductPickerDto>> {
  try {
    const userId = await getAuthenticatedUserId();
    return success("Товары загружены.", await createEstimateService().searchProducts(userId, input));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function createEstimateAction(input: CreateEstimateActionInput): Promise<ActionResult<{ id: string }>> {
  if (!input.name?.trim() || !input.currencyCode?.trim()) return invalidInput("Укажите название и валюту сметы.");
  try {
    const userId = await getAuthenticatedUserId();
    const estimate = await createEstimateService().createDraft(userId, input);
    revalidatePath("/cabinet/estimates");
    return success("Смета создана.", { id: estimate.id });
  } catch (error) {
    return failureFromError(error);
  }
}

export async function getEstimateAction(estimateId: string): Promise<ActionResult<EstimateDetailDto>> {
  try {
    const userId = await getAuthenticatedUserId();
    return success("Смета загружена.", await createEstimateService().getDetail(userId, estimateId));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function saveEstimateAction(estimateId: string, input: { expectedRevision: number; name: string; customerName?: string | null; projectName?: string | null; validityDays: number }): Promise<ActionResult<EstimateDetailDto>> {
  if (!input.name?.trim()) return invalidInput("Укажите название сметы.");
  return runEstimateMutation(
    (userId) => createEstimateService().saveDraft(userId, estimateId, input),
    "Смета сохранена.",
  );
}

export async function saveEstimateCommercialAction(estimateId: string, input: SaveEstimateCommercialCommand): Promise<ActionResult<EstimateDetailDto>> {
  if (!input.name?.trim()) return invalidInput("Укажите название сметы.");
  return runEstimateMutation(
    (userId) => createEstimateService().saveCommercialDraft(userId, estimateId, input),
    "Коммерческие условия сохранены.",
  );
}

export async function addEstimateProductsAction(estimateId: string, expectedRevision: number, selections: Array<{ productId: string; quantity: number }>): Promise<ActionResult<EstimateDetailDto>> {
  if (!Array.isArray(selections) || !selections.length) return invalidInput("Выберите товары.");
  return runEstimateMutation(
    (userId) => createEstimateService().addProducts(userId, estimateId, expectedRevision, selections),
    "Товары добавлены.",
  );
}

export async function addEstimateServiceAction(estimateId: string, input: { expectedRevision: number; serviceId: string; quantity: number; sellingUnitPrice: number }): Promise<ActionResult<EstimateDetailDto>> {
  if (!input.serviceId?.trim()) return invalidInput("Выберите работу или услугу.");
  return runEstimateMutation(
    (userId) => createEstimateService().addService(userId, estimateId, input.expectedRevision, input.serviceId, input.quantity, input.sellingUnitPrice),
    "Услуга добавлена.",
  );
}

export async function addEstimateServicesAction(estimateId: string, expectedRevision: number, selections: EstimateServiceSelection[]): Promise<ActionResult<EstimateDetailDto>> {
  if (!Array.isArray(selections) || !selections.length) return invalidInput("Выберите работы или услуги.");
  return runEstimateMutation(
    (userId) => createEstimateService().addServices(userId, estimateId, expectedRevision, selections),
    "Работы и услуги добавлены.",
  );
}

export async function addEstimateCustomLineAction(estimateId: string, input: { expectedRevision: number; description: string; unit: EstimateUnit; quantity: number; sellingUnitPrice: number }): Promise<ActionResult<EstimateDetailDto>> {
  if (!input.description?.trim()) return invalidInput("Укажите описание позиции.");
  return runEstimateMutation(
    (userId) => createEstimateService().addCustomLine(userId, estimateId, input.expectedRevision, input.description, input.unit, input.quantity, input.sellingUnitPrice),
    "Позиция добавлена.",
  );
}

export async function updateEstimateLineAction(estimateId: string, itemId: string, input: { expectedRevision: number; description: string; unit: EstimateUnit; quantity: number; sellingUnitPrice: number }): Promise<ActionResult<EstimateDetailDto>> {
  return runEstimateMutation(
    (userId) => createEstimateService().updateLine(userId, estimateId, itemId, input.expectedRevision, input),
    "Позиция сохранена.",
  );
}

export async function removeEstimateLineAction(estimateId: string, itemId: string, expectedRevision: number): Promise<ActionResult<EstimateDetailDto>> {
  return runEstimateMutation(
    (userId) => createEstimateService().removeLine(userId, estimateId, itemId, expectedRevision),
    "Позиция удалена.",
  );
}

export async function removeEstimateLinesAction(estimateId: string, itemIds: string[], expectedRevision: number): Promise<ActionResult<EstimateDetailDto>> {
  if (!Array.isArray(itemIds) || !itemIds.length) return invalidInput("Выберите позиции для удаления.");
  return runEstimateMutation(
    (userId) => createEstimateService().removeLines(userId, estimateId, itemIds, expectedRevision),
    "Выбранные позиции удалены.",
  );
}

export async function archiveEstimateAction(estimateId: string, expectedRevision: number): Promise<ActionResult<null>> {
  try {
    const userId = await getAuthenticatedUserId();
    await createEstimateService().archive(userId, estimateId, expectedRevision);
    revalidatePath("/cabinet/estimates");
    return success("Смета перемещена в архив.", null);
  } catch (error) {
    return failureFromError(error);
  }
}

async function runEstimateMutation(
  mutation: (userId: string) => Promise<EstimateDetailDto>,
  message: string,
): Promise<ActionResult<EstimateDetailDto>> {
  try {
    const userId = await getAuthenticatedUserId();
    const detail = await mutation(userId);
    return success(message, detail);
  } catch (error) {
    return failureFromError(error);
  }
}

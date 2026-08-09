"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import type { EstimateCommercialCheckDto, EstimateCommercialOptionsDto, EstimateDetailDto, EstimateLineInsertion, EstimateListFilters, EstimateProductPickerDto, EstimateSectionInsertion, EstimateServiceDto, EstimateServiceSelection, ExternalNomenclatureInput, SaveEstimateCommercialCommand } from "../services";
import type { EstimateUnit, FinalCustomerIndustryCode } from "../types";
import { createEstimateService, getAuthenticatedUserId } from "./service-factory";

export type CreateEstimateActionInput = {
  name: string;
  finalCustomerId?: string | null;
  customerName?: string | null;
  projectName?: string | null;
  currencyCode: string;
  validityDays: number;
  requestKey: string;
};

export async function searchFinalCustomersAction(query: string) {
  if (query.trim().length < 2) return success("Введите минимум два символа.", []);
  try {
    const userId = await getAuthenticatedUserId();
    return success("Заказчики найдены.", await createEstimateService().searchFinalCustomers(userId, query));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function createFinalCustomerAction(input: {
  displayName: string;
  customerType: "company" | "individual";
  fiscalCode?: string | null;
  locality?: string | null;
  industryCode?: FinalCustomerIndustryCode | null;
}) {
  if (!input.displayName?.trim()) return invalidInput("Укажите заказчика.");
  try {
    const userId = await getAuthenticatedUserId();
    return success("Заказчик создан.", await createEstimateService().createFinalCustomer(userId, input));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function updateFinalCustomerAction(customerId: string, expectedRevision: number, input: {
  displayName: string;
  customerType: "company" | "individual";
  fiscalCode?: string | null;
  locality?: string | null;
  industryCode?: FinalCustomerIndustryCode | null;
}) {
  if (!input.displayName?.trim()) return invalidInput("Укажите заказчика.");
  try {
    const userId = await getAuthenticatedUserId();
    return success("Заказчик обновлён.", await createEstimateService().updateFinalCustomer(userId, customerId, expectedRevision, input));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function listFinalCustomersAction(filters: { search?: string; industryCode?: string; page?: number } = {}) {
  try {
    const userId = await getAuthenticatedUserId();
    return success("Заказчики загружены.", await createEstimateService().listFinalCustomers(userId, filters));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function getFinalCustomerAction(customerId: string) {
  try {
    const userId = await getAuthenticatedUserId();
    return success("Заказчик загружен.", await createEstimateService().getFinalCustomerDetail(userId, customerId));
  } catch (error) {
    return failureFromError(error);
  }
}

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
    return estimateFailure(error, "product_search");
  }
}

export async function checkEstimateCommercialStateAction(estimateId: string): Promise<ActionResult<EstimateCommercialCheckDto>> {
  try {
    const userId = await getAuthenticatedUserId();
    return success("Текущие цены и наличие проверены.", await createEstimateService().checkCurrentProductState(userId, estimateId));
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
    console.error({ event: "estimate_creation_failed", errorName: error instanceof Error ? error.name : typeof error, deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null });
    const result = failureFromError(error);
    return result.errorCode === "SYSTEM_ERROR"
      ? { ...result, message: "Не удалось создать смету. Проверьте данные и повторите попытку." }
      : result;
  }
}

export async function searchExternalNomenclatureAction(query: string) {
  if (query.trim().length < 2) return success("Введите минимум два символа.", []);
  try {
    const userId = await getAuthenticatedUserId();
    return success("Похожие позиции найдены.", await createEstimateService().searchExternalNomenclature(userId, query));
  } catch (error) {
    return estimateFailure(error, "external_nomenclature_search");
  }
}

export async function addEstimateExternalLineAction(estimateId: string, input: { expectedRevision: number } & ExternalNomenclatureInput): Promise<ActionResult<EstimateDetailDto>> {
  return runEstimateMutation(
    (userId) => createEstimateService().addExternalLine(userId, estimateId, input.expectedRevision, input),
    "Внешняя позиция добавлена.",
  );
}

export async function getEstimateAction(estimateId: string): Promise<ActionResult<EstimateDetailDto>> {
  try {
    const userId = await getAuthenticatedUserId();
    return success("Смета загружена.", await createEstimateService().getDetail(userId, estimateId));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function saveEstimateAction(estimateId: string, input: { expectedRevision: number; name: string; finalCustomerId?: string | null; customerName?: string | null; projectName?: string | null; validityDays: number }): Promise<ActionResult<EstimateDetailDto>> {
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

export async function addEstimateSectionAction(estimateId: string, expectedRevision: number, insertion: EstimateSectionInsertion): Promise<ActionResult<EstimateDetailDto>> {
  if (!insertion.name?.trim()) return invalidInput("Укажите название раздела.");
  return runEstimateMutation(
    (userId) => createEstimateService().addSection(userId, estimateId, expectedRevision, insertion),
    "Раздел добавлен.",
  );
}

export async function addEstimateProductsAction(estimateId: string, expectedRevision: number, selections: Array<{ productId: string; quantity: number }>, insertion: EstimateLineInsertion): Promise<ActionResult<EstimateDetailDto>> {
  if (!Array.isArray(selections) || !selections.length) return invalidInput("Выберите товары.");
  return runEstimateMutation(
    (userId) => createEstimateService().addProducts(userId, estimateId, expectedRevision, selections, insertion),
    "Товары добавлены.",
  );
}

export async function addEstimateServiceAction(estimateId: string, input: { expectedRevision: number; serviceId: string; quantity: number; sellingUnitPrice: number } & EstimateLineInsertion): Promise<ActionResult<EstimateDetailDto>> {
  if (!input.serviceId?.trim()) return invalidInput("Выберите работу или услугу.");
  return runEstimateMutation(
    (userId) => createEstimateService().addService(userId, estimateId, input.expectedRevision, input.serviceId, input.quantity, input.sellingUnitPrice, input),
    "Услуга добавлена.",
  );
}

export async function addEstimateServicesAction(estimateId: string, expectedRevision: number, selections: EstimateServiceSelection[], insertion: EstimateLineInsertion): Promise<ActionResult<EstimateDetailDto>> {
  if (!Array.isArray(selections) || !selections.length) return invalidInput("Выберите работы или услуги.");
  return runEstimateMutation(
    (userId) => createEstimateService().addServices(userId, estimateId, expectedRevision, selections, insertion),
    "Работы и услуги добавлены.",
  );
}

export async function addEstimateCustomLineAction(estimateId: string, input: { expectedRevision: number; description: string; unit: EstimateUnit; quantity: number; sellingUnitPrice: number } & EstimateLineInsertion): Promise<ActionResult<EstimateDetailDto>> {
  if (!input.description?.trim()) return invalidInput("Укажите описание позиции.");
  return runEstimateMutation(
    (userId) => createEstimateService().addCustomLine(userId, estimateId, input.expectedRevision, input.description, input.unit, input.quantity, input.sellingUnitPrice, input),
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
    return estimateFailure(error, "mutation");
  }
}

function estimateFailure(error: unknown, stage: string) {
  console.error({
    event: "estimate_action_failed",
    stage,
    errorName: error instanceof Error ? error.name : typeof error,
    databaseCode: typeof error === "object" && error !== null && "databaseCode" in error
      ? String(error.databaseCode ?? "") || null
      : null,
    deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  });
  const result = failureFromError(error);
  return result.errorCode === "SYSTEM_ERROR"
    ? { ...result, message: "Не удалось выполнить действие. Данные сметы сохранены — повторите попытку." }
    : result;
}

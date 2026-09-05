"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import { InvalidStateError } from "../../access-control/services";
import type { EstimateCommercialCheckDto, EstimateCommercialOptionsDto, EstimateDetailDto, EstimateLineInsertion, EstimateListFilters, EstimateProductPickerDto, EstimateSectionInsertion, EstimateServiceDto, EstimateServiceSelection, ExternalNomenclatureInput, PartnerNomenclatureInput, PartnerNomenclatureListFilters, SaveEstimateCommercialCommand } from "../services";
import type { ExternalNomenclatureItemType } from "../repositories";
import type { EstimateUnit, FinalCustomerIndustryCode } from "../types";
import { createEstimateService, getAuthenticatedUserId } from "./service-factory";
import { resolveCanonicalSectionKey } from "../services/estimate-sections";

export async function listEditableEstimatesForProductAction(): Promise<ActionResult<Array<{ id: string; name: string; estimateNumber: string; revision: number }>>> {
  try {
    const userId = await getAuthenticatedUserId();
    const result = await createEstimateService().list(userId, { status: "draft", page: 1 });
    return success("Доступные сметы загружены.", result.records.map(({ id, name, estimateNumber, revision }) => ({ id, name, estimateNumber, revision })));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function addCatalogProductToEstimateAction(input: { estimateId: string; productId: string; quantity: number; requestKey: string }): Promise<ActionResult<{ estimateId: string }>> {
  try {
    const userId = await getAuthenticatedUserId();
    const service = createEstimateService();
    const estimate = await service.getDetail(userId, input.estimateId);
    const equipment = estimate.sections.find((section) => resolveCanonicalSectionKey(section) === "equipment");
    if (!equipment) return invalidInput("В смете отсутствует раздел «Оборудование».");
    await service.addProducts(userId, estimate.id, estimate.revision, [{ productId: input.productId, quantity: input.quantity }], { targetSectionId: equipment.id, requestKey: input.requestKey });
    revalidatePath(`/cabinet/estimates/${estimate.id}`);
    return success("Товар добавлен в смету.", { estimateId: estimate.id });
  } catch (error) {
    return estimateFailure(error, "catalog_product_add_to_estimate");
  }
}

export type CreateEstimateActionInput = {
  name: string;
  finalCustomerId?: string | null;
  customerName?: string | null;
  projectName?: string | null;
  currencyCode: string;
  validityDays: number;
  requestKey: string;
  productId?: string | null;
  lineRequestKey?: string | null;
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

export async function updateFinalCustomerEmailAction(input: {
  estimateId: string;
  customerId: string;
  expectedRevision: number;
  primaryEmail: string;
}) {
  try {
    const userId = await getAuthenticatedUserId();
    const customer = await createEstimateService().updateFinalCustomerEmail(
      userId,
      input.estimateId,
      input.customerId,
      input.expectedRevision,
      input.primaryEmail,
    );
    revalidatePath(`/cabinet/estimates/${input.estimateId}`);
    return success("Email заказчика сохранён.", {
      customerId: customer.id,
      primaryEmail: customer.primaryEmail!,
      revision: customer.revision,
    });
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

export async function searchEstimateProductsAction(input: { search?: string; categoryId?: string; brandId?: string; includeFacets?: boolean }): Promise<ActionResult<EstimateProductPickerDto>> {
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
    const estimate = input.productId
      ? await createEstimateService().createDraftWithProduct(userId, {
          ...input,
          productId: input.productId,
          quantity: 1,
          lineRequestKey: input.lineRequestKey ?? "",
        })
      : await createEstimateService().createDraft(userId, input);
    revalidatePath("/cabinet/estimates");
    return success(input.productId ? "Смета создана, товар добавлен в раздел «Оборудование»." : "Смета создана.", { id: "estimateId" in estimate ? estimate.estimateId : estimate.id });
  } catch (error) {
    console.error({ event: "estimate_creation_failed", errorName: error instanceof Error ? error.name : typeof error, deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null });
    const result = failureFromError(error);
    return result.errorCode === "SYSTEM_ERROR"
      ? { ...result, message: "Не удалось создать смету. Проверьте данные и повторите попытку." }
      : result;
  }
}

export type CreateEstimateFromSelectionActionInput = Omit<CreateEstimateActionInput, "productId"> & {
  selections: Array<{ productId: string; quantity: number }>;
};

export async function createEstimateFromSelectionAction(input: CreateEstimateFromSelectionActionInput): Promise<ActionResult<{ id: string }>> {
  if (!input.name?.trim() || !input.currencyCode?.trim() || !Array.isArray(input.selections) || input.selections.length < 1 || input.selections.length > 50) {
    return invalidInput("Укажите заказчика и выберите от 1 до 50 товаров.");
  }
  try {
    const estimate = await createEstimateService().createDraftWithProducts(await getAuthenticatedUserId(), {
      name: input.name,
      finalCustomerId: input.finalCustomerId,
      customerName: input.customerName,
      projectName: input.projectName,
      currencyCode: input.currencyCode,
      validityDays: input.validityDays,
      requestKey: input.requestKey,
      lineRequestKey: input.lineRequestKey ?? "",
      selections: input.selections,
    });
    revalidatePath("/cabinet/estimates");
    return success("КП создано из подборки.", { id: estimate.estimateId });
  } catch (error) {
    return estimateFailure(error, "live_selection_estimate_create");
  }
}

export async function searchExternalNomenclatureAction(input: { query: string; itemType: ExternalNomenclatureItemType; scope?: "own" | "shared" }) {
  const query = input.query.trim();
  if (query.trim().length < 2) return success("Введите минимум два символа.", []);
  try {
    const userId = await getAuthenticatedUserId();
    return success("Позиции найдены.", await createEstimateService().searchExternalNomenclature(userId, query, input.itemType, input.scope === "shared" ? "shared" : "own"));
  } catch (error) {
    return estimateFailure(error, "external_nomenclature_search");
  }
}

export async function listPartnerNomenclatureAction(filters: PartnerNomenclatureListFilters = {}) {
  try {
    const userId = await getAuthenticatedUserId();
    return success("Номенклатура загружена.", await createEstimateService().listPartnerNomenclature(userId, filters));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function createPartnerNomenclatureAction(input: PartnerNomenclatureInput) {
  try {
    const userId = await getAuthenticatedUserId();
    const id = await createEstimateService().createPartnerNomenclature(userId, input);
    revalidatePath("/cabinet/nomenclature");
    return success("Позиция добавлена в вашу номенклатуру.", { id });
  } catch (error) {
    if (error instanceof InvalidStateError) return invalidInput(error.message);
    return failureFromError(error);
  }
}

export async function updatePartnerNomenclatureAction(itemId: string, expectedVersion: number, input: Omit<PartnerNomenclatureInput, "itemType" | "manufacturer" | "model" | "forceCreateNew" | "requestKey">) {
  try {
    const userId = await getAuthenticatedUserId();
    const version = await createEstimateService().updatePartnerNomenclature(userId, itemId, expectedVersion, input);
    revalidatePath("/cabinet/nomenclature");
    return success("Позиция обновлена.", { version });
  } catch (error) {
    return failureFromError(error);
  }
}

export async function archivePartnerNomenclatureAction(itemId: string, expectedVersion: number) {
  try {
    const userId = await getAuthenticatedUserId();
    await createEstimateService().archivePartnerNomenclature(userId, itemId, expectedVersion);
    revalidatePath("/cabinet/nomenclature");
    return success("Позиция удалена из вашей номенклатуры.", null);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function adoptPartnerNomenclatureAction(itemId: string) {
  try { const userId = await getAuthenticatedUserId(); await createEstimateService().adoptPartnerNomenclature(userId, itemId); revalidatePath("/cabinet/nomenclature"); return success("Позиция добавлена в вашу номенклатуру.", null); }
  catch (error) { return failureFromError(error); }
}

export async function addEstimateExternalLineAction(estimateId: string, input: { expectedRevision: number } & ExternalNomenclatureInput): Promise<ActionResult<EstimateDetailDto>> {
  return runEstimateMutation(
    (userId) => createEstimateService().addExternalLine(userId, estimateId, input.expectedRevision, input),
    "Внешняя позиция добавлена.",
    true,
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

export async function deleteArchivedEstimateAction(estimateId: string, expectedRevision: number, requestKey: string): Promise<ActionResult<null>> {
  try {
    const userId = await getAuthenticatedUserId();
    await createEstimateService().deleteArchived(userId, estimateId, expectedRevision, requestKey);
    revalidatePath("/cabinet/estimates");
    return success("Архивная смета удалена.", null);
  } catch (error) {
    return failureFromError(error);
  }
}

async function runEstimateMutation(
  mutation: (userId: string) => Promise<EstimateDetailDto>,
  message: string,
  preserveInvalidStateMessage = false,
): Promise<ActionResult<EstimateDetailDto>> {
  try {
    const userId = await getAuthenticatedUserId();
    const detail = await mutation(userId);
    return success(message, detail);
  } catch (error) {
    if (preserveInvalidStateMessage && error instanceof InvalidStateError) return invalidInput(error.message);
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

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import { createPurchasingListService, getAuthenticatedUserId } from "./service-factory";

const metadataSchema = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(1000).nullable().optional(), visibility: z.enum(["private", "company"]) });
const uuid = z.string().uuid();
const selectionSchema = z.array(z.object({ itemId: uuid, quantity: z.number().int().min(1).max(9999).optional() })).max(200);

export async function listPurchasingListsAction(input: { search?: string; filter?: "all" | "private" | "company" | "mine" | "archived"; page?: number } = {}) {
  try { return success("Списки закупок загружены.", await createPurchasingListService().list(await getAuthenticatedUserId(), input)); }
  catch (error) { return failureFromError(error); }
}

export async function getPurchasingListAction(listId: string) {
  try { return success("Список закупок загружен.", await createPurchasingListService().getDetail(await getAuthenticatedUserId(), uuid.parse(listId))); }
  catch (error) { return failureFromError(error); }
}

export async function listManageablePurchasingListsAction() {
  try { return success("Списки закупок загружены.", await createPurchasingListService().listManageableChoices(await getAuthenticatedUserId())); }
  catch (error) { return failureFromError(error); }
}

export async function createPurchasingListAction(input: z.input<typeof metadataSchema>) {
  const parsed = metadataSchema.safeParse(input); if (!parsed.success) return invalidInput("Проверьте название и доступ списка.");
  try { const list = await createPurchasingListService().createManual(await getAuthenticatedUserId(), parsed.data); revalidateLists(list.id); return success("Список закупок создан.", { id: list.id }); }
  catch (error) { return failureFromError(error); }
}

export async function createPurchasingListFromCartAction(input: z.input<typeof metadataSchema>) {
  const parsed = metadataSchema.safeParse(input); if (!parsed.success) return invalidInput("Проверьте название списка.");
  try { const result = await createPurchasingListService().createFromCart(await getAuthenticatedUserId(), parsed.data); revalidateLists(result.list.id); return success("Корзина сохранена как список закупок.", { id: result.list.id, skipped: result.skipped }); }
  catch (error) { return failureFromError(error); }
}

export async function createPurchasingListFromOrderAction(input: z.input<typeof metadataSchema> & { orderId: string; selections?: Array<{ lineId: string; quantity: number }> }) {
  const parsed = metadataSchema.extend({ orderId: uuid, selections: z.array(z.object({ lineId: uuid, quantity: z.number().int().min(1).max(9999) })).max(200).optional() }).safeParse(input);
  if (!parsed.success) return invalidInput("Проверьте выбранные позиции.");
  try { const result = await createPurchasingListService().createFromOrder(await getAuthenticatedUserId(), parsed.data); revalidateLists(result.list.id); return success("Заказ сохранён как список закупок.", { id: result.list.id, skipped: result.skipped }); }
  catch (error) { return failureFromError(error); }
}

export async function addCatalogProductToPurchasingListAction(input: { listId: string; productId: string; quantity: number; mergeMode: "increase" | "replace" | "keep" }) {
  const parsed = z.object({ listId: uuid, productId: uuid, quantity: z.number().int().min(1).max(9999), mergeMode: z.enum(["increase", "replace", "keep"]) }).safeParse(input);
  if (!parsed.success) return invalidInput("Проверьте товар и количество.");
  try { const list = await createPurchasingListService().addProduct(await getAuthenticatedUserId(), parsed.data); revalidateLists(list.id); return success("Товар добавлен в список.", { id: list.id }); }
  catch (error) { return failureFromError(error); }
}

export async function updatePurchasingListMetadataAction(listId: string, expectedRevision: number, input: z.input<typeof metadataSchema>) {
  const parsed = metadataSchema.safeParse(input); if (!parsed.success) return invalidInput("Проверьте данные списка.");
  try { const list = await createPurchasingListService().updateMetadata(await getAuthenticatedUserId(), uuid.parse(listId), expectedRevision, parsed.data); revalidateLists(list.id); return success("Список обновлён.", { revision: list.revision }); }
  catch (error) { return failureFromError(error); }
}

export async function updatePurchasingListItemsAction(listId: string, expectedRevision: number, items: Array<{ itemId: string; quantity: number; position: number; note?: string | null }>) {
  const parsed = z.array(z.object({ itemId: uuid, quantity: z.number().int().min(1).max(9999), position: z.number().int().min(1).max(200), note: z.string().max(500).nullable().optional() })).min(1).max(200).safeParse(items);
  if (!parsed.success) return invalidInput("Проверьте количество и порядок позиций.");
  try { const list = await createPurchasingListService().updateItems(await getAuthenticatedUserId(), uuid.parse(listId), expectedRevision, parsed.data); revalidateLists(list.id); return success("Позиции сохранены.", { revision: list.revision }); }
  catch (error) { return failureFromError(error); }
}

export async function removePurchasingListItemsAction(listId: string, expectedRevision: number, itemIds: string[]) {
  const parsed = z.array(uuid).min(1).max(200).safeParse(itemIds); if (!parsed.success) return invalidInput("Выберите позиции.");
  try { const list = await createPurchasingListService().removeItems(await getAuthenticatedUserId(), uuid.parse(listId), expectedRevision, parsed.data); revalidateLists(list.id); return success("Позиции удалены.", { revision: list.revision }); }
  catch (error) { return failureFromError(error); }
}

export async function setPurchasingListArchivedAction(listId: string, expectedRevision: number, archived: boolean) {
  try { const list = await createPurchasingListService().setArchived(await getAuthenticatedUserId(), uuid.parse(listId), expectedRevision, archived); revalidateLists(list.id); return success(archived ? "Список архивирован." : "Список восстановлен.", { revision: list.revision }); }
  catch (error) { return failureFromError(error); }
}

export async function duplicatePurchasingListAction(listId: string, name?: string) {
  try { const list = await createPurchasingListService().duplicate(await getAuthenticatedUserId(), uuid.parse(listId), name); revalidateLists(list.id); return success("Копия списка создана.", { id: list.id }); }
  catch (error) { return failureFromError(error); }
}

export async function addPurchasingListToCartAction(input: { listId: string; requestKey: string; selections?: Array<{ itemId: string }> }) {
  const parsed = z.object({ listId: uuid, requestKey: uuid, selections: selectionSchema.optional() }).safeParse(input); if (!parsed.success) return invalidInput("Проверьте выбранные позиции.");
  try { const result = await createPurchasingListService().addToCart(await getAuthenticatedUserId(), { listId: parsed.data.listId, requestKey: parsed.data.requestKey, itemIds: parsed.data.selections?.map((item) => item.itemId) }); revalidatePath("/cabinet/cart"); revalidatePath("/cabinet", "layout"); return success(result.repeated ? "Результат предыдущей попытки восстановлен." : "Товары добавлены в корзину.", result); }
  catch (error) { return failureFromError(error); }
}

export async function createEstimateFromPurchasingListAction(input: { listId: string; name: string; requestKey: string; selections?: Array<{ itemId: string }> }) {
  const parsed = z.object({ listId: uuid, name: z.string().trim().min(1).max(200), requestKey: uuid, selections: selectionSchema.optional() }).safeParse(input); if (!parsed.success) return invalidInput("Проверьте название сметы и позиции.");
  try { const result = await createPurchasingListService().createEstimate(await getAuthenticatedUserId(), { listId: parsed.data.listId, name: parsed.data.name, requestKey: parsed.data.requestKey, itemIds: parsed.data.selections?.map((item) => item.itemId) }); revalidatePath("/cabinet/estimates"); revalidatePath(`/cabinet/estimates/${result.estimateId}`); return success("Смета создана.", result); }
  catch (error) { return failureFromError(error); }
}

function revalidateLists(listId: string) { revalidatePath("/cabinet/purchasing-lists"); revalidatePath(`/cabinet/purchasing-lists/${listId}`); }

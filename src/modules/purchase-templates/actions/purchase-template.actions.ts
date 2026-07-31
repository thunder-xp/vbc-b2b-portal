"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import { createPurchaseTemplateService, getAuthenticatedUserId } from "./service-factory";

const uuid = z.string().uuid();
const metadata = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(1000).nullable().optional(), visibility: z.enum(["private", "company"]), requestKey: uuid });
const item = z.object({ productId: uuid, preferredQuantity: z.number().int().min(1).max(9999), lineNote: z.string().trim().max(500).nullable(), sortOrder: z.number().int().min(1).max(200) });

export async function listPurchaseTemplatesAction(input: { search?: string; filter?: "all" | "mine" | "company" | "active" | "archived"; page?: number } = {}) {
  try { return success("Шаблоны закупок загружены.", await createPurchaseTemplateService().list(await getAuthenticatedUserId(), input)); }
  catch (error) { return failureFromError(error); }
}

export async function getPurchaseTemplateAction(templateId: string) {
  const parsed = uuid.safeParse(templateId);
  if (!parsed.success) return invalidInput("Шаблон закупок не найден.");
  try { return success("Шаблон закупок загружен.", await createPurchaseTemplateService().getDetail(await getAuthenticatedUserId(), parsed.data)); }
  catch (error) { return failureFromError(error); }
}

export async function createPurchaseTemplateAction(input: z.input<typeof metadata>) {
  const parsed = metadata.safeParse(input);
  if (!parsed.success) return invalidInput("Проверьте название и доступ шаблона.");
  try { const template = await createPurchaseTemplateService().createManual(await getAuthenticatedUserId(), parsed.data); revalidateTemplates(template.id); return success("Шаблон закупок создан.", { id: template.id }); }
  catch (error) { return failureFromError(error); }
}

export async function createPurchaseTemplateFromCartAction(input: z.input<typeof metadata>) {
  const parsed = metadata.safeParse(input);
  if (!parsed.success) return invalidInput("Проверьте данные шаблона.");
  try { const template = await createPurchaseTemplateService().createFromCart(await getAuthenticatedUserId(), parsed.data); revalidateTemplates(template.id); return success("Корзина сохранена как шаблон закупок.", { id: template.id }); }
  catch (error) { return failureFromError(error); }
}

export async function createPurchaseTemplateFromOrderAction(input: z.input<typeof metadata> & { orderId: string }) {
  const parsed = metadata.extend({ orderId: uuid }).safeParse(input);
  if (!parsed.success) return invalidInput("Проверьте заказ и данные шаблона.");
  try { const template = await createPurchaseTemplateService().createFromOrder(await getAuthenticatedUserId(), parsed.data); revalidateTemplates(template.id); return success("Заказ сохранён как шаблон закупок.", { id: template.id }); }
  catch (error) { return failureFromError(error); }
}

export async function createPurchaseTemplateFromPurchasingListAction(input: z.input<typeof metadata> & { listId: string }) {
  const parsed = metadata.extend({ listId: uuid }).safeParse(input);
  if (!parsed.success) return invalidInput("Проверьте список и данные шаблона.");
  try { const template = await createPurchaseTemplateService().createFromPurchasingList(await getAuthenticatedUserId(), parsed.data); revalidateTemplates(template.id); return success("Список сохранён как шаблон закупок.", { id: template.id }); }
  catch (error) { return failureFromError(error); }
}

export async function createPurchaseTemplateFromDashboardAction(input: { requestKey: string; items: Array<{ productId: string; quantity: number }> }) {
  const parsed = z.object({ requestKey: uuid, items: z.array(z.object({ productId: uuid, quantity: z.number().int().min(1).max(9999) })).min(1).max(4) }).safeParse(input);
  if (!parsed.success) return invalidInput("Не удалось подготовить шаблон из повторных закупок.");
  try { const template = await createPurchaseTemplateService().createFromDashboardReorder(await getAuthenticatedUserId(), parsed.data); revalidateTemplates(template.id); return success("Шаблон повторной закупки создан.", { id: template.id }); }
  catch (error) { return failureFromError(error); }
}

export async function updatePurchaseTemplateAction(input: { templateId: string; expectedRevision: number; name: string; description?: string | null; visibility: "private" | "company"; items: z.input<typeof item>[] }) {
  const parsed = metadata.omit({ requestKey: true }).extend({ templateId: uuid, expectedRevision: z.number().int().positive(), items: z.array(item).max(200) }).safeParse(input);
  if (!parsed.success) return invalidInput("Проверьте позиции и данные шаблона.");
  try { const template = await createPurchaseTemplateService().update(await getAuthenticatedUserId(), parsed.data); revalidateTemplates(template.id); return success("Шаблон закупок сохранён.", { id: template.id, revision: template.revision }); }
  catch (error) { return failureFromError(error); }
}

export async function copyPurchaseTemplateAction(templateId: string, requestKey: string) {
  const parsed = z.object({ templateId: uuid, requestKey: uuid }).safeParse({ templateId, requestKey });
  if (!parsed.success) return invalidInput("Не удалось создать копию шаблона.");
  try { const template = await createPurchaseTemplateService().copy(await getAuthenticatedUserId(), parsed.data.templateId, parsed.data.requestKey); revalidateTemplates(template.id); return success("Копия шаблона создана.", { id: template.id }); }
  catch (error) { return failureFromError(error); }
}

export async function archivePurchaseTemplateAction(templateId: string, expectedRevision: number) {
  const parsed = z.object({ templateId: uuid, expectedRevision: z.number().int().positive() }).safeParse({ templateId, expectedRevision });
  if (!parsed.success) return invalidInput("Не удалось архивировать шаблон.");
  try { const template = await createPurchaseTemplateService().archive(await getAuthenticatedUserId(), parsed.data.templateId, parsed.data.expectedRevision); revalidateTemplates(template.id); return success("Шаблон перемещён в архив.", null); }
  catch (error) { return failureFromError(error); }
}

export async function addPurchaseTemplateToCartAction(input: { templateId: string; requestKey: string; multiplier: number; selections?: Array<{ itemId: string; quantity: number }> }) {
  const parsed = z.object({ templateId: uuid, requestKey: uuid, multiplier: z.union([z.literal(0.5), z.literal(1), z.literal(2), z.literal(3)]), selections: z.array(z.object({ itemId: uuid, quantity: z.number().int().min(1).max(9999) })).max(200).optional() }).safeParse(input);
  if (!parsed.success) return invalidInput("Проверьте выбранные позиции и количество.");
  try { const result = await createPurchaseTemplateService().addToCart(await getAuthenticatedUserId(), parsed.data); revalidateTemplates(parsed.data.templateId); revalidatePath("/cabinet/cart"); revalidatePath("/cabinet"); return success(result.repeated ? "Этот шаблон уже добавлен в корзину." : "Доступные позиции добавлены в корзину.", result); }
  catch (error) { return failureFromError(error); }
}

function revalidateTemplates(templateId: string) {
  revalidatePath("/cabinet/purchase-templates");
  revalidatePath(`/cabinet/purchase-templates/${templateId}`);
  revalidatePath("/cabinet");
}

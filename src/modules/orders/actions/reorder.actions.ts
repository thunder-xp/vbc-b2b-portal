"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failureFromError, invalidInput, success, type ActionResult } from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type { QuickReorderConversionResultDto, QuickReorderPreviewDto } from "../services";
import { createQuickReorderService } from "./service-factory";

export async function getQuickReorderPreviewAction(orderId: string): Promise<ActionResult<QuickReorderPreviewDto>> {
  try {
    return success("Данные для повторного заказа загружены.", await createQuickReorderService().preview(await getAuthenticatedUserId(), orderId));
  } catch (error) {
    return failureFromError(error);
  }
}

const selectionSchema = z.array(z.object({
  lineId: z.string().uuid(),
  quantity: z.number().int().min(1).max(9999),
})).min(1).max(200);

const historicalDemandSchema = z.object({
  orderId: z.string().uuid(),
  requestKey: z.string().uuid(),
  lineId: z.string().uuid().optional(),
});

export async function addHistoricalOrderToCartAction(input: {
  orderId: string;
  requestKey: string;
  lineId?: string;
}): Promise<ActionResult<QuickReorderConversionResultDto>> {
  const parsed = historicalDemandSchema.safeParse(input);
  if (!parsed.success) return invalidInput("Не удалось определить заказ или позицию.");
  try {
    const result = await createQuickReorderService().addSelectedToCart(await getAuthenticatedUserId(), parsed.data);
    revalidatePath("/cabinet/cart");
    revalidatePath(`/cabinet/orders/${parsed.data.orderId}`);
    revalidatePath("/cabinet", "layout");
    return success("Заказ обработан в корзине.", result);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function addQuickReorderToCartAction(
  _state: ActionResult<QuickReorderConversionResultDto | null>,
  formData: FormData,
): Promise<ActionResult<QuickReorderConversionResultDto | null>> {
  const orderId = text(formData, "orderId");
  const requestKey = text(formData, "requestKey");
  let lines: z.infer<typeof selectionSchema>;
  try {
    lines = selectionSchema.parse(JSON.parse(text(formData, "lines")));
  } catch {
    return invalidInput("Проверьте выбранные позиции и количество.");
  }
  if (!orderId || !requestKey) return invalidInput("Не удалось определить попытку добавления.");
  try {
    const result = await createQuickReorderService().addSelectedToCart(
      await getAuthenticatedUserId(),
      { orderId, requestKey, lines },
    );
    revalidatePath("/cabinet/cart");
    revalidatePath(`/cabinet/orders/${orderId}`);
    revalidatePath("/cabinet", "layout");
    return success(result.repeated ? "Результат предыдущей попытки восстановлен." : "Выбранные товары обработаны.", result);
  } catch (error) {
    return failureFromError(error);
  }
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

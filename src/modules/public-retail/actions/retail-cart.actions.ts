"use server";

import { getOrCreateRetailCartTokenHash, getRetailCartTokenHash, rotateRetailCartTokenHash } from "../retail-cart-cookie";
import { getRetailCartService } from "../retail-cart-server";
import { RetailCartExpiredError } from "../services/retail-cart.service";
import type { PublicRetailCartMutationDto, PublicRetailLocale } from "../types";

export type RetailCartActionResult = { success: boolean; message: string; data: PublicRetailCartMutationDto | null };
const fail = (message: string): RetailCartActionResult => ({ success: false, message, data: null });

export async function addPublicRetailProductAction(input: { publicProductId: string; quantity: number; source: "catalog" | "product_detail"; requestId: string; locale: PublicRetailLocale }): Promise<RetailCartActionResult> {
  try {
    const data = await withExpiredCartRecovery((hash) => getRetailCartService().addProduct(hash, input));
    return { success: true, message: input.locale === "ro" ? "Produsul a fost adăugat în coș." : "Товар добавлен в корзину.", data };
  } catch (error) {
    safeCartFailure("add_product", error);
    return fail(input.locale === "ro" ? "Produsul nu a putut fi adăugat. Reîncercați." : "Не удалось добавить товар. Повторите попытку.");
  }
}

export async function addPublicRetailCctvSystemAction(input: { items: Array<{ publicProductId: string; quantity: number; commercialGroup: "equipment" | "materials" }>; installationIntent: Record<string, boolean> | null; requestId: string; locale: PublicRetailLocale }): Promise<RetailCartActionResult> {
  try {
    const data = await withExpiredCartRecovery((hash) => getRetailCartService().addCctvSystem(hash, input));
    return { success: true, message: input.locale === "ro" ? "Sistemul a fost adăugat în coș." : "Система добавлена в корзину.", data };
  } catch (error) {
    safeCartFailure("add_cctv_system", error);
    return fail(input.locale === "ro" ? "Configurația s-a modificat. Recalculați sistemul." : "Конфигурация изменилась. Пересчитайте систему.");
  }
}

export async function updatePublicRetailCartQuantityAction(input: { publicProductId: string; bundleId: string | null; quantity: number; expectedRevision: number; locale: PublicRetailLocale }): Promise<RetailCartActionResult> {
  const hash = await getRetailCartTokenHash();
  if (!hash) return fail(input.locale === "ro" ? "Coșul nu mai este disponibil." : "Корзина больше недоступна.");
  try {
    const data = await getRetailCartService().updateQuantity(hash, input);
    return { success: true, message: input.locale === "ro" ? "Cantitatea a fost actualizată." : "Количество обновлено.", data };
  } catch (error) {
    safeCartFailure("update_quantity", error);
    return fail(input.locale === "ro" ? "Coșul s-a modificat. Reîncărcați pagina." : "Корзина изменилась. Обновите страницу.");
  }
}

export async function removePublicRetailCartItemAction(input: { publicProductId: string; bundleId: string | null; expectedRevision: number; locale: PublicRetailLocale }): Promise<RetailCartActionResult> {
  const hash = await getRetailCartTokenHash();
  if (!hash) return fail(input.locale === "ro" ? "Coșul nu mai este disponibil." : "Корзина больше недоступна.");
  try {
    const data = await getRetailCartService().removeItem(hash, input);
    return { success: true, message: input.locale === "ro" ? "Produsul a fost eliminat." : "Товар удалён.", data };
  } catch (error) {
    safeCartFailure("remove_item", error);
    return fail(input.locale === "ro" ? "Coșul s-a modificat. Reîncărcați pagina." : "Корзина изменилась. Обновите страницу.");
  }
}

async function withExpiredCartRecovery(operation: (tokenHash: string) => Promise<PublicRetailCartMutationDto>) {
  try {
    return await operation(await getOrCreateRetailCartTokenHash());
  } catch (error) {
    if (!(error instanceof RetailCartExpiredError)) throw error;
    return operation(await rotateRetailCartTokenHash());
  }
}

function safeCartFailure(operation: string, error: unknown) {
  console.error({ event: "public_retail_cart_mutation_failed", operation, errorName: error instanceof Error ? error.name : typeof error });
}

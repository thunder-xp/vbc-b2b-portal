"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getRetailCartTokenCredential, rotateRetailCartTokenHash } from "../retail-cart-cookie";
import { getRetailCheckoutService, hasRetailCheckoutAccess } from "../retail-checkout-server";
import { deriveRetailOrderAccessToken } from "../retail-order-token";
import { hashRetailOrderAccessToken } from "../retail-order-token";
import { RetailCheckoutConflictError, RetailCheckoutInputError, RetailCheckoutUnavailableError, type RetailCheckoutInput } from "../services/retail-checkout.service";

export type RetailCheckoutActionResult = { success: boolean; message: string; orderToken: string | null; conflict: boolean };
export type RetailOfferActionResult = { success: boolean; message: string; offer: Awaited<ReturnType<ReturnType<typeof getRetailCheckoutService>["createCommercialOffer"]>> | null };

export async function createPublicRetailCommercialOfferAction(input: { locale: "ru" | "ro"; idempotencyKey: string }): Promise<RetailOfferActionResult> {
  const ru = input.locale === "ru";
  if (!await hasRetailCheckoutAccess()) return { success: false, message: ru ? "Предложение пока доступно только в пилотном режиме." : "Oferta este disponibilă momentan doar în regim pilot.", offer: null };
  const credential = await getRetailCartTokenCredential();
  if (!credential) return { success: false, message: ru ? "Сначала выберите эконом-вариант." : "Selectați mai întâi varianta economică.", offer: null };
  try {
    const offer = await getRetailCheckoutService().createCommercialOffer(credential.hash, input.idempotencyKey, input.locale);
    if (offer.status !== "active") return { success: false, message: ru ? "Срок предложения завершён. Действует обычная цена эконом-варианта." : "Oferta a expirat. Se aplică prețul obișnuit al variantei economice.", offer };
    console.info({ event: "final_discount_created", policyVersion: offer.policyVersion });
    return { success: true, message: ru ? "Предложение закреплено за вашей корзиной." : "Oferta a fost asociată coșului dvs.", offer };
  } catch (error) {
    console.error({ event: "public_retail_commercial_offer_failed", errorName: error instanceof Error ? error.name : typeof error });
    return { success: false, message: ru ? "Не удалось подготовить предложение. Проверьте эконом-вариант в корзине." : "Oferta nu a putut fi pregătită. Verificați varianta economică din coș.", offer: null };
  }
}

export async function createPublicRetailOrderAction(input: RetailCheckoutInput): Promise<RetailCheckoutActionResult> {
  const ru = input.locale === "ru";
  if (!await hasRetailCheckoutAccess()) return failure(ru ? "Оформление заказа пока доступно только в пилотном режиме." : "Plasarea comenzii este disponibilă momentan doar în regim pilot.");
  const credential = await getRetailCartTokenCredential();
  if (!credential) return failure(ru ? "Корзина больше недоступна. Вернитесь в корзину." : "Coșul nu mai este disponibil. Reveniți în coș.");
  const access = deriveRetailOrderAccessToken(credential.token, input.submissionKey);
  try {
    await getRetailCheckoutService().createOrder(credential.hash, access.hash, input);
    console.info({ event: "public_retail_order_locked", installerSelection: input.installationSelectionMode ?? "not_applicable", commercialOfferApplied: Boolean(input.commercialOfferId) });
    await rotateRetailCartTokenHash();
    return { success: true, message: ru ? "Заказ подготовлен." : "Comanda a fost pregătită.", orderToken: access.token, conflict: false };
  } catch (error) {
    console.error({ event: "public_retail_checkout_failed", errorName: error instanceof Error ? error.name : typeof error });
    if (error instanceof RetailCheckoutConflictError) return { ...failure(ru ? "Цена или состав корзины изменились. Проверьте актуальные данные и подтвердите заказ снова." : "Prețul sau conținutul coșului s-a modificat. Verificați datele actuale și confirmați din nou comanda."), conflict: true };
    if (error instanceof RetailCheckoutUnavailableError) return failure(ru ? "Заказ нельзя оформить с текущим составом. Проверьте корзину." : "Comanda nu poate fi plasată cu conținutul actual. Verificați coșul.");
    if (error instanceof RetailCheckoutInputError) return failure(ru ? "Проверьте контактные данные и адрес." : "Verificați datele de contact și adresa.");
    return failure(ru ? "Не удалось подготовить заказ. Повторите попытку." : "Comanda nu a putut fi pregătită. Încercați din nou.");
  }
}

function failure(message: string): RetailCheckoutActionResult { return { success: false, message, orderToken: null, conflict: false }; }

export async function respondToInstallationCompletionAction(formData: FormData) {
  const token = String(formData.get("orderToken") ?? "");
  const hash = hashRetailOrderAccessToken(token);
  if (!hash) return;
  const command = String(formData.get("command") ?? "") as "confirm" | "report_issue";
  let result = "updated";
  try {
    await getRetailCheckoutService().transitionInstallation(hash, { command, expectedRevision: Number(formData.get("revision") ?? -1), category: String(formData.get("category") ?? "") || null, note: String(formData.get("note") ?? "") || null, idempotencyKey: String(formData.get("idempotencyKey") ?? "") });
    revalidatePath(`/order/${token}`);
  } catch (error) {
    console.error({ event: "public_installation_confirmation_failed", errorName: error instanceof Error ? error.name : typeof error });
    result = "conflict";
  }
  redirect(`/order/${token}?installation=${result}`);
}

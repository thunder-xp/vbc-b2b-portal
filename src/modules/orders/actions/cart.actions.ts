"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type { CartDetailDto } from "../services";
import { createCartService } from "./service-factory";

export async function getCartAction(): Promise<ActionResult<CartDetailDto>> {
  try { return success("Cart loaded.", await createCartService().getCart(await getAuthenticatedUserId())); }
  catch (error) { return failureFromError(error); }
}

export async function getCartItemCountAction(): Promise<ActionResult<number>> {
  try { return success("Cart count loaded.", await createCartService().getItemCount(await getAuthenticatedUserId())); }
  catch (error) { return failureFromError(error); }
}

export async function addToCartAction(productId: string, quantity = 1): Promise<ActionResult<null>> {
  try {
    await createCartService().addItem(await getAuthenticatedUserId(), productId, quantity);
    revalidateCart();
    return success("Товар добавлен в корзину.", null);
  } catch (error) { return failureFromError(error); }
}

export async function updateCartItemAction(
  _state: ActionResult<null>,
  formData: FormData,
): Promise<ActionResult<null>> {
  const itemId = text(formData, "itemId");
  const quantity = Number(text(formData, "quantity"));
  if (!itemId || !Number.isInteger(quantity)) return invalidInput("Укажите корректное количество.");
  try {
    await createCartService().updateQuantity(await getAuthenticatedUserId(), itemId, quantity);
    revalidateCart();
    return success("Количество обновлено.", null);
  } catch (error) { return failureFromError(error); }
}

export async function removeCartItemAction(
  _state: ActionResult<null>,
  formData: FormData,
): Promise<ActionResult<null>> {
  const itemId = text(formData, "itemId");
  if (!itemId) return invalidInput();
  try {
    await createCartService().removeItem(await getAuthenticatedUserId(), itemId);
    revalidateCart();
    return success("Товар удалён из корзины.", null);
  } catch (error) { return failureFromError(error); }
}

function text(formData: FormData, key: string): string { const value = formData.get(key); return typeof value === "string" ? value.trim() : ""; }
function revalidateCart(): void { revalidatePath("/cabinet", "layout"); revalidatePath("/cabinet/cart"); }

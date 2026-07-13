"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { createProjectSpecificationService } from "./service-factory";

export async function addProjectSpecificationItemAction(
  specificationId: string,
  productId: string,
  quantity: number,
): Promise<ActionResult<null>> {
  if (!specificationId.trim() || !productId.trim()) return invalidInput();
  try {
    const userId = await getAuthenticatedUserId();
    await createProjectSpecificationService().addItem(userId, specificationId, productId, quantity);
    revalidatePath(`/cabinet/specifications/${specificationId}`);
    return success("Product added.", null);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function updateProjectSpecificationItemQuantityAction(
  specificationId: string,
  itemId: string,
  quantity: number,
): Promise<ActionResult<null>> {
  if (!specificationId.trim() || !itemId.trim()) return invalidInput();
  try {
    const userId = await getAuthenticatedUserId();
    await createProjectSpecificationService().updateItemQuantity(userId, specificationId, itemId, quantity);
    revalidatePath(`/cabinet/specifications/${specificationId}`);
    return success("Quantity updated.", null);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function removeProjectSpecificationItemAction(
  specificationId: string,
  itemId: string,
): Promise<ActionResult<null>> {
  if (!specificationId.trim() || !itemId.trim()) return invalidInput();
  try {
    const userId = await getAuthenticatedUserId();
    await createProjectSpecificationService().removeItem(userId, specificationId, itemId);
    revalidatePath(`/cabinet/specifications/${specificationId}`);
    return success("Product removed.", null);
  } catch (error) {
    return failureFromError(error);
  }
}

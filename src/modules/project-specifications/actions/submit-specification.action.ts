"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { createProjectSpecificationService } from "./service-factory";

export async function submitProjectSpecificationAction(
  specificationId: string,
): Promise<ActionResult<null>> {
  if (!specificationId.trim()) return invalidInput("Specification is required.");
  try {
    const userId = await getAuthenticatedUserId();
    await createProjectSpecificationService().submit(userId, specificationId);
    revalidatePath(`/cabinet/specifications/${specificationId}`);
    revalidatePath("/cabinet/specifications");
    return success("Specification submitted to Novotech.", null);
  } catch (error) {
    return failureFromError(error);
  }
}

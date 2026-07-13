"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type { SaveSpecificationActionInput } from "./create-specification.action";
import { createProjectSpecificationService } from "./service-factory";

export async function updateProjectSpecificationAction(
  specificationId: string,
  input: SaveSpecificationActionInput,
): Promise<ActionResult<null>> {
  if (!specificationId.trim() || !input.projectName?.trim() || !input.customerSiteName?.trim()) {
    return invalidInput("Project name and customer/site name are required.");
  }
  try {
    const userId = await getAuthenticatedUserId();
    await createProjectSpecificationService().updateDraft(userId, specificationId, input);
    revalidatePath(`/cabinet/specifications/${specificationId}`);
    revalidatePath("/cabinet/specifications");
    return success("Draft saved.", null);
  } catch (error) {
    return failureFromError(error);
  }
}

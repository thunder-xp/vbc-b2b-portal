"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { createProjectSpecificationService } from "./service-factory";

export type SaveSpecificationActionInput = {
  projectName: string;
  customerSiteName: string;
  description?: string | null;
};

export async function createProjectSpecificationAction(
  input: SaveSpecificationActionInput,
): Promise<ActionResult<{ id: string }>> {
  if (!input.projectName?.trim() || !input.customerSiteName?.trim()) {
    return invalidInput("Project name and customer/site name are required.");
  }
  try {
    const userId = await getAuthenticatedUserId();
    const specification = await createProjectSpecificationService().createDraft(userId, input);
    revalidatePath("/cabinet/specifications");
    return success("Draft created.", { id: specification.id });
  } catch (error) {
    return failureFromError(error);
  }
}

"use server";

import { type ActionResult, failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type { ProjectSpecificationDetailDto } from "../services";
import { createProjectSpecificationService } from "./service-factory";

export async function getProjectSpecificationAction(
  specificationId: string,
): Promise<ActionResult<ProjectSpecificationDetailDto>> {
  if (!specificationId.trim()) return invalidInput("Specification is required.");
  try {
    const userId = await getAuthenticatedUserId();
    return success(
      "Project specification loaded.",
      await createProjectSpecificationService().getDetail(userId, specificationId),
    );
  } catch (error) {
    return failureFromError(error);
  }
}

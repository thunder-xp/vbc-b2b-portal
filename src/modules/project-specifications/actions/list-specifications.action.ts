"use server";

import { type ActionResult, failureFromError, success } from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type { ProjectSpecificationSummaryDto } from "../services";
import { createProjectSpecificationService } from "./service-factory";

export async function listProjectSpecificationsAction(): Promise<ActionResult<ProjectSpecificationSummaryDto[]>> {
  try {
    const userId = await getAuthenticatedUserId();
    return success(
      "Project specifications loaded.",
      await createProjectSpecificationService().listOwnCompanySpecifications(userId),
    );
  } catch (error) {
    return failureFromError(error);
  }
}

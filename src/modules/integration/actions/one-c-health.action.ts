"use server";

import {
  failureFromError,
  success,
  type ActionResult,
} from "../../access-control/actions/action-result";
import {
  createUserProfileService,
  getAuthenticatedUserId,
} from "../../access-control/actions/service-factory";
import { ForbiddenError } from "../../access-control/services";
import { canApprovePartnerRequests } from "../../access-control/services/internal-authorization";
import { getOneCEnv } from "../../../lib/env";
import {
  runOneCODataHealthCheck,
  type OneCHealthReport,
} from "../providers/one-c/one-c-health-check";

export async function runOneCHealthCheckAction(): Promise<ActionResult<OneCHealthReport>> {
  try {
    const userId = await getAuthenticatedUserId();
    const profile = await createUserProfileService().ensureActiveUser(userId);
    if (!canApprovePartnerRequests(profile)) throw new ForbiddenError();

    return success("1C OData diagnostics completed.", await runOneCODataHealthCheck(getOneCEnv()));
  } catch (error) {
    return failureFromError(error);
  }
}

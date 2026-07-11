"use server";

import {
  failureFromError,
  success,
  type ActionResult,
} from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type { PartnerWorkspaceContext } from "../services";
import { createPartnerWorkspaceContextService } from "./service-factory";

export async function getPartnerWorkspaceContextAction(): Promise<
  ActionResult<PartnerWorkspaceContext>
> {
  try {
    const userId = await getAuthenticatedUserId();
    const context = await createPartnerWorkspaceContextService().getWorkspaceContext(userId);
    return success("Partner workspace context loaded.", context);
  } catch (error) {
    return failureFromError(error);
  }
}

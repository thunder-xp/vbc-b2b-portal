"use server";

import {
  failureFromError,
  success,
  type ActionResult,
} from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type { WorkspaceHomeDto } from "../services";
import { createWorkspaceHomeService } from "./service-factory";

export async function getWorkspaceHomeAction(): Promise<
  ActionResult<WorkspaceHomeDto>
> {
  try {
    const userId = await getAuthenticatedUserId();
    const workspace = await createWorkspaceHomeService().getWorkspaceHome(userId);

    return success("Workspace loaded.", workspace);
  } catch (error) {
    return failureFromError(error);
  }
}

"use server";

import {
  failureFromError,
  success,
  type ActionResult,
} from "../../access-control/actions/action-result";
import { getAuthenticatedUser } from "../../access-control/actions/service-factory";
import type { WorkspaceHomeDto } from "../services";
import { createWorkspaceHomeService } from "./service-factory";

export async function getWorkspaceHomeAction(): Promise<
  ActionResult<WorkspaceHomeDto>
> {
  try {
    const user = await getAuthenticatedUser();
    const workspace = await createWorkspaceHomeService().getWorkspaceHome(user.id, user.loginGeneration);

    return success("Workspace loaded.", workspace);
  } catch (error) {
    return failureFromError(error);
  }
}

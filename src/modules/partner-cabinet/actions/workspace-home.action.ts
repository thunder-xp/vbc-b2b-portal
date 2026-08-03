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
  const startedAt = performance.now();
  console.info(JSON.stringify({ event: "dashboard_load_started" }));
  try {
    const user = await getAuthenticatedUser();
    const workspace = await createWorkspaceHomeService().getWorkspaceHome(user.id, user.loginGeneration);

    console.info(JSON.stringify({
      event: "dashboard_load_completed",
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    }));
    return success("Workspace loaded.", workspace);
  } catch (error) {
    return failureFromError(error);
  }
}

"use server";

import {
  failureFromError,
  success,
  type ActionResult,
} from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type { PartnerWorkspaceContext } from "../services";
import { createPartnerWorkspaceContextService } from "./service-factory";
import {
  emitRequestTotal,
  measurePerformanceStage,
} from "@/src/lib/performance/request-diagnostics";

export async function getPartnerWorkspaceContextAction(): Promise<
  ActionResult<PartnerWorkspaceContext>
> {
  try {
    const userId = await getAuthenticatedUserId();
    const context = await measurePerformanceStage(
      "workspace",
      "access_context",
      () => createPartnerWorkspaceContextService().getWorkspaceContext(userId),
    );
    return success("Partner workspace context loaded.", context);
  } catch (error) {
    return failureFromError(error);
  } finally {
    emitRequestTotal("workspace");
  }
}

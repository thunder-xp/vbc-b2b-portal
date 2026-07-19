"use server";

import { failureFromError, success, type ActionResult } from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type { FinanceOverview } from "../types";
import { createFinanceService } from "./service-factory";

export async function getFinanceOverviewAction(): Promise<ActionResult<FinanceOverview>> {
  try {
    const userId = await getAuthenticatedUserId();
    return success("Finance overview loaded.", await createFinanceService().getOverview(userId));
  } catch (error) {
    return failureFromError(error);
  }
}

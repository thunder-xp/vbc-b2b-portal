"use server";

import { ForbiddenError } from "../../access-control/services";
import { failureFromError, success, type ActionResult } from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type { FinanceCompanySyncResult, FinanceSyncBatchResult } from "../services";
import { createFinanceSyncAuthorizationService, createFinanceSyncCoordinator } from "./service-factory";

export async function synchronizeFinanceCompanyAction(companyId: string): Promise<ActionResult<FinanceCompanySyncResult>> {
  try {
    const userId = await requireInternalFinanceUser();
    if (!isPortalUuid(companyId)) throw new ForbiddenError();
    return success("Finance synchronization completed.", await createFinanceSyncCoordinator().synchronizeCompany({ companyId, trigger: "manual", actorUserId: userId }));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function synchronizeEligibleFinanceCompaniesAction(): Promise<ActionResult<FinanceSyncBatchResult>> {
  try {
    const userId = await requireInternalFinanceUser();
    return success("Finance synchronization batch completed.", await createFinanceSyncCoordinator().synchronizeCompanies({ trigger: "manual", actorUserId: userId }));
  } catch (error) {
    return failureFromError(error);
  }
}

async function requireInternalFinanceUser(): Promise<string> {
  const userId = await getAuthenticatedUserId();
  await createFinanceSyncAuthorizationService().ensureAllowed(userId);
  return userId;
}

function isPortalUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

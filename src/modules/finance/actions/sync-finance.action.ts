"use server";

import { ForbiddenError } from "../../access-control/services";
import { failureFromError, success, type ActionResult } from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type { FinanceCompanySyncResult, FinanceSyncBatchResult } from "../services";
import { createFinanceService, createFinanceSyncAuthorizationService, createFinanceSyncCoordinator } from "./service-factory";

export async function synchronizeOwnFinanceCompanyAction(): Promise<ActionResult<FinanceCompanySyncResult>> {
  try {
    const userId = await getAuthenticatedUserId();
    const companyId = await createFinanceService().getAuthorizedCompanyId(userId);
    const result = await createFinanceSyncCoordinator().synchronizeCompany({ companyId, trigger: "manual", actorUserId: userId });
    if (result.status === "failed") return { success: false, data: null, message: "Не удалось обновить финансовые данные. Последние подтверждённые данные сохранены.", errorCode: "SYSTEM_ERROR" };
    if (result.status === "locked") return { success: false, data: null, message: "Обновление уже выполняется. Дождитесь завершения.", errorCode: "CONFLICT" };
    if (result.status === "mapping_missing") return { success: false, data: null, message: "Для компании не настроена связь с 1С. Обратитесь к менеджеру Novotech.", errorCode: "INVALID_INPUT" };
    return success(result.status === "zero_balance" ? "Данные обновлены. Ненулевых балансов нет." : "Финансовые данные обновлены из 1С.", result);
  } catch (error) {
    return failureFromError(error);
  }
}

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

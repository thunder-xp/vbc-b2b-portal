"use server";

import { revalidatePath } from "next/cache";

import { getOneCEnv } from "@/src/lib/env";
import { OneCProvider } from "@/src/modules/integration/providers/one-c/one-c-provider";

import { SupabaseAdminCompanyRepository } from "../repositories";
import {
  AdminCompanyOneCManualSyncService,
  AdminOneCManualSyncError,
  requireAdminPermission,
} from "../services";
import type {
  AdminOneCManualSyncApplyResult,
  AdminOneCManualSyncDiscovery,
  AdminOneCManualSyncErrorCode,
} from "../types";

export type AdminOneCManualSyncActionState = {
  status: "idle" | "discovered" | "success" | "error";
  message: string;
  correlationId: string | null;
  errorCode: AdminOneCManualSyncErrorCode | null;
  discovery: AdminOneCManualSyncDiscovery | null;
  result: AdminOneCManualSyncApplyResult | null;
};

export async function discoverAdminCompanyOneCSyncAction(
  _previousState: AdminOneCManualSyncActionState,
  formData: FormData,
): Promise<AdminOneCManualSyncActionState> {
  const correlationId = crypto.randomUUID();
  const companyId = String(formData.get("companyId") ?? "");
  try {
    await requireManualSyncPermissions();
    const discovery = await service().discover({
      companyId,
      query: String(formData.get("query") ?? ""),
      correlationId,
    });
    return {
      status: "discovered",
      message: discovery.errors.includes("MULTIPLE_CONTRACT_CANDIDATES")
        ? "Найдено несколько допустимых договоров NS. Выберите точный договор перед подтверждением."
        : "Свежие данные 1С получены. Проверьте сравнение и подтвердите изменения.",
      correlationId,
      errorCode: discovery.errors[0] ?? null,
      discovery,
      result: null,
    };
  } catch (error) {
    return actionFailure(error, correlationId, companyId, "discovery");
  }
}

export async function applyAdminCompanyOneCSyncAction(
  _previousState: AdminOneCManualSyncActionState,
  formData: FormData,
): Promise<AdminOneCManualSyncActionState> {
  const correlationId = crypto.randomUUID();
  const companyId = String(formData.get("companyId") ?? "");
  try {
    await requireManualSyncPermissions();
    if (String(formData.get("confirmed") ?? "") !== "yes") {
      throw new Error("Manual synchronization confirmation is required.");
    }
    const result = await service().apply({
      companyId,
      mainContractRef: String(formData.get("mainContractRef") ?? ""),
      cashContractRef: String(formData.get("cashContractRef") ?? ""),
      reason: String(formData.get("reason") ?? ""),
      correlationId,
    });
    revalidatePath(`/admin/companies/${companyId}`);
    revalidatePath(`/admin/partners/companies/${companyId}`);
    return {
      status: result.status === "success" ? "success" : "error",
      message: result.message,
      correlationId: result.status === "success" ? null : correlationId,
      errorCode: result.status === "success" ? null : "COMMERCIAL_PROFILE_NOT_READY",
      discovery: null,
      result,
    };
  } catch (error) {
    return actionFailure(error, correlationId, companyId, "apply");
  }
}

async function requireManualSyncPermissions(): Promise<void> {
  await requireAdminPermission("admin.integrations.manage");
  await requireAdminPermission("admin.partner_integrity.manage");
}

function service(): AdminCompanyOneCManualSyncService {
  return new AdminCompanyOneCManualSyncService(
    new SupabaseAdminCompanyRepository(),
    new OneCProvider(getOneCEnv()).partners,
  );
}

function actionFailure(
  error: unknown,
  correlationId: string,
  companyId: string,
  stage: "discovery" | "apply",
): AdminOneCManualSyncActionState {
  const errorCode = error instanceof AdminOneCManualSyncError
    ? error.code
    : error instanceof Error && error.name === "PermissionRequiredError"
      ? "UNAUTHORIZED"
      : "ONE_C_UNAVAILABLE";
  console.error({
    event: "admin_company_manual_one_c_sync_failed",
    companyId,
    correlationId,
    stage,
    errorCode,
    errorType: error instanceof Error ? error.name : typeof error,
  });
  return {
    status: "error",
    message: `${errorMessage(errorCode)} Код обращения: ${correlationId}`,
    correlationId,
    errorCode,
    discovery: null,
    result: null,
  };
}

function errorMessage(code: AdminOneCManualSyncErrorCode): string {
  return ({
    CONTRACT_NOT_FOUND: "Подходящий договор 1С не найден.",
    MULTIPLE_CONTRACT_CANDIDATES: "Найдено несколько договоров; требуется точный выбор администратора.",
    PRICE_TYPE_NOT_DEFINED: "В договоре 1С не определён действующий вид цены.",
    CURRENCY_CONFLICT: "Валютные реквизиты договора и вида цены не прошли проверку.",
    ORGANIZATION_MISMATCH: "Договор относится к другой организации.",
    COUNTERPARTY_CONFLICT: "Данные контрагента не совпадают с проверенной привязкой Portal.",
    ONE_C_UNAVAILABLE: "1С недоступна или вернула непроверяемый ответ. Предыдущие значения сохранены.",
    COMMERCIAL_PROFILE_NOT_READY: "Коммерческий профиль не достиг состояния READY.",
    UNAUTHORIZED: "Недостаточно прав для ручной синхронизации с 1С.",
  })[code];
}

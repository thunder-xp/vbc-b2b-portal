"use server";

import { revalidatePath } from "next/cache";

import { getOneCEnv } from "@/src/lib/env";
import { OneCProvider } from "@/src/modules/integration/providers/one-c/one-c-provider";
import {
  CounterpartyDirectorySyncInProgressError,
  CounterpartyDirectorySyncService,
  OneCCounterpartyDirectorySource,
} from "@/src/modules/onboarding/services";

import type { CommercialProfileSyncResultCode, ContractMappingResultCode } from "../types";
import { createAdminCompanyService, requireAdminPermission } from "../services";

export type AdminContractMappingActionState = {
  code: ContractMappingResultCode | null;
  message: string;
  correlationId: string | null;
  currentPriceTypeRef: string | null;
  selectedPriceTypeRef: string | null;
};

export type AdminContractDirectoryRefreshState = {
  status: "idle" | "success" | "error" | "in_progress";
  message: string;
  correlationId: string | null;
};

export type AdminCommercialProfileSyncActionState = {
  code: CommercialProfileSyncResultCode | null;
  message: string;
  correlationId: string | null;
};

export async function synchronizeAdminCompanyCommercialProfileAction(
  _previousState: AdminCommercialProfileSyncActionState,
  formData: FormData,
): Promise<AdminCommercialProfileSyncActionState> {
  const correlationId = crypto.randomUUID();
  const companyId = String(formData.get("companyId") ?? "");
  try {
    await requireAdminPermission("admin.partner_integrity.manage");
    const result = await createAdminCompanyService().synchronizeCommercialProfile({
      companyId,
      expectedVersion: Number(formData.get("expectedVersion")),
      reason: String(formData.get("reason") ?? ""),
      correlationId,
      provider: new OneCProvider(getOneCEnv()).partners,
    });
    if (result.code === "COMMERCIAL_PROFILE_SYNC_SUCCESS") revalidateCompany(companyId);
    return {
      code: result.code,
      message: commercialProfileMessage(result.code, correlationId, result.inProgress === true),
      correlationId: result.code === "COMMERCIAL_PROFILE_SYNC_SUCCESS" ? null : correlationId,
    };
  } catch (error) {
    console.error({
      event: "admin_company_commercial_profile_sync_failed",
      companyId,
      correlationId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      code: "COMMERCIAL_PROFILE_SYNC_FAILED",
      message: commercialProfileMessage("COMMERCIAL_PROFILE_SYNC_FAILED", correlationId, false),
      correlationId,
    };
  }
}

export async function mapAdminCompanyContractAction(
  _previousState: AdminContractMappingActionState,
  formData: FormData,
): Promise<AdminContractMappingActionState> {
  const correlationId = crypto.randomUUID();
  const companyId = String(formData.get("companyId") ?? "");
  try {
    await requireAdminPermission("admin.partner_integrity.manage");
    const result = await createAdminCompanyService().mapContract({
      companyId,
      contractRef: String(formData.get("contractRef") ?? ""),
      expectedVersion: Number(formData.get("expectedVersion")),
      reason: String(formData.get("reason") ?? ""),
      correlationId,
    });
    if (result.code === "CONTRACT_MAPPING_SUCCESS") {
      revalidateCompany(companyId);
    }
    return {
      code: result.code,
      message: mappingMessage(result.code, correlationId),
      correlationId: result.code === "CONTRACT_MAPPING_SUCCESS" ? null : correlationId,
      currentPriceTypeRef: result.currentPriceTypeRef ?? null,
      selectedPriceTypeRef: result.selectedPriceTypeRef ?? null,
    };
  } catch (error) {
    console.error({
      event: "admin_company_contract_mapping_failed",
      companyId,
      correlationId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      code: "CONTRACT_MAPPING_FAILED",
      message: mappingMessage("CONTRACT_MAPPING_FAILED", correlationId),
      correlationId,
      currentPriceTypeRef: null,
      selectedPriceTypeRef: null,
    };
  }
}

export async function refreshAdminCompanyContractDirectoryAction(
  _previousState: AdminContractDirectoryRefreshState,
  formData: FormData,
): Promise<AdminContractDirectoryRefreshState> {
  const correlationId = crypto.randomUUID();
  const companyId = String(formData.get("companyId") ?? "");
  try {
    await requireAdminPermission("admin.integrations.manage");
    await new CounterpartyDirectorySyncService(
      new OneCCounterpartyDirectorySource(getOneCEnv()),
    ).synchronize();
    revalidateCompany(companyId);
    return {
      status: "success",
      message: "Справочник договоров повторно проверен в 1С.",
      correlationId: null,
    };
  } catch (error) {
    if (error instanceof CounterpartyDirectorySyncInProgressError) {
      return {
        status: "in_progress",
        message: "Проверка справочника 1С уже выполняется. Повторный запуск не создан.",
        correlationId: null,
      };
    }
    console.error({
      event: "admin_company_contract_directory_refresh_failed",
      companyId,
      correlationId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      status: "error",
      message: `Не удалось повторно проверить справочник 1С. Код обращения: ${correlationId}`,
      correlationId,
    };
  }
}

function revalidateCompany(companyId: string): void {
  revalidatePath(`/admin/companies/${companyId}`);
  revalidatePath(`/admin/partners/companies/${companyId}`);
}

function mappingMessage(code: ContractMappingResultCode, correlationId: string): string {
  const messages: Record<ContractMappingResultCode, string> = {
    CONTRACT_MAPPING_SUCCESS: "Основной договор 1С сопоставлен.",
    CONTRACT_NOT_FOUND: "Выбранный договор отсутствует в опубликованном справочнике 1С.",
    CONTRACT_NOT_OWNED_BY_COMPANY: "Выбранный договор принадлежит другому контрагенту.",
    CONTRACT_INACTIVE: "Выбранный договор неактивен или помечен на удаление.",
    CONTRACT_INVALID_TYPE: "Можно сопоставить только договор с покупателем.",
    CONTRACT_ORGANIZATION_MISMATCH: "Договор относится к другой организации Novotech.",
    CONTRACT_PRICE_TYPE_MISMATCH: "Вид цены договора отличается от коммерческого профиля компании. Сначала синхронизируйте коммерческие данные.",
    CONTRACT_MAPPING_CONFLICT: "Сопоставление уже изменено другим администратором. Обновите страницу и повторите действие.",
    CONTRACT_MAPPING_FAILED: `Не удалось сохранить сопоставление. Код обращения: ${correlationId}`,
  };
  return messages[code];
}

function commercialProfileMessage(
  code: CommercialProfileSyncResultCode,
  correlationId: string,
  inProgress: boolean,
): string {
  if (inProgress) return "Обновление коммерческого профиля этой компании уже выполняется.";
  const messages: Record<CommercialProfileSyncResultCode, string> = {
    COMMERCIAL_PROFILE_SYNC_SUCCESS: "Коммерческий профиль опубликован по проверенным данным основного договора 1С.",
    COMMERCIAL_PROFILE_MISMATCH: "Профиль был изменён другим администратором. Обновите страницу и повторите действие.",
    COMMERCIAL_CONTRACT_MISSING: "Сначала сопоставьте основной договор компании.",
    COMMERCIAL_CONTRACT_INVALID: "Сопоставленный договор не прошёл проверку владельца, организации, типа или состояния.",
    COMMERCIAL_PRICE_TYPE_MISSING: "В основном договоре 1С не указан вид цены.",
    COMMERCIAL_PRICE_TYPE_UNKNOWN: "Вид цены договора отсутствует в локальном опубликованном справочнике.",
    COMMERCIAL_PRICE_DATA_STALE: "Цены этого профиля отсутствуют или устарели. Профиль компании не изменён.",
    COMMERCIAL_CURRENCY_MISMATCH: "Валюта договора, вида цены и локального профиля не совпадает. Профиль компании не изменён.",
    COMMERCIAL_PROFILE_SYNC_FAILED: `Не удалось обновить коммерческий профиль. Код обращения: ${correlationId}`,
  };
  return messages[code];
}

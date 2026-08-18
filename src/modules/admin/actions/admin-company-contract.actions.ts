"use server";

import { revalidatePath } from "next/cache";

import { getOneCEnv } from "@/src/lib/env";
import {
  CounterpartyDirectorySyncInProgressError,
  CounterpartyDirectorySyncService,
  OneCCounterpartyDirectorySource,
} from "@/src/modules/onboarding/services";

import type { ContractMappingResultCode } from "../types";
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

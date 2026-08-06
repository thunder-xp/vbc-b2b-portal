"use server";

import { getAuthenticatedUserId } from "@/src/modules/access-control/actions/service-factory";
import { failureFromError, invalidInput, success, type ActionResult } from "@/src/modules/access-control/actions/action-result";
import { requireAdminPermission } from "@/src/modules/admin/services";
import { createWarrantySerialService } from "./factory";
import type { InternalWarrantyLookup, PartnerWarrantyLookup, WarrantySerialDiagnostics } from "./types";

export async function lookupPartnerWarrantySerialAction(
  _state: ActionResult<PartnerWarrantyLookup | null>,
  formData: FormData,
): Promise<ActionResult<PartnerWarrantyLookup | null>> {
  const serial = text(formData, "serial");
  if (!serial) return invalidInput("Введите серийный номер.");
  try {
    return success("Проверка завершена.", await createWarrantySerialService().lookupPartner(await getAuthenticatedUserId(), serial));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function lookupInternalWarrantySerialAction(
  _state: ActionResult<InternalWarrantyLookup | null>,
  formData: FormData,
): Promise<ActionResult<InternalWarrantyLookup | null>> {
  const serial = text(formData, "serial");
  if (!serial) return invalidInput("Введите серийный номер.");
  try {
    await requireAdminPermission("admin.service.serial.verify");
    return success("Проверка завершена.", await createWarrantySerialService().lookupInternal(serial));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function getWarrantySerialDiagnosticsAction(): Promise<ActionResult<WarrantySerialDiagnostics>> {
  try {
    await requireAdminPermission("admin.integrations.warranty_serials.view");
    return success("Диагностика загружена.", await createWarrantySerialService().diagnostics());
  } catch (error) {
    return failureFromError(error);
  }
}

export async function getPartnerWarrantyVerificationAction(verificationId: string) {
  try {
    return success("Проверка загружена.", await createWarrantySerialService().getPartnerVerification(await getAuthenticatedUserId(), verificationId));
  } catch (error) {
    return failureFromError(error);
  }
}

function text(data: FormData, key: string) { const value = data.get(key); return typeof value === "string" ? value.trim() : ""; }

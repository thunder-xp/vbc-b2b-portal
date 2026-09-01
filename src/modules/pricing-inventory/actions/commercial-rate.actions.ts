"use server";

import { revalidatePath } from "next/cache";

import {
  failureFromError,
  invalidInput,
  success,
  type ActionResult,
} from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import {
  CommercialRateValidationError,
  type CommercialRateAdminDto,
} from "../services";
import type { CommercialRate, CommercialRatePurpose } from "../types";
import { createCommercialRateManagementService } from "./service-factory";
import { requireAdminPermission } from "../../admin/services";

export async function getCommercialRateAdminViewAction(): Promise<ActionResult<CommercialRateAdminDto>> {
  try {
    await requireAdminPermission("admin.rates.view");
    const data = await createCommercialRateManagementService().getAdminView(await getAuthenticatedUserId());
    return success("Коммерческие курсы загружены.", data);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function publishCommercialRateAction(
  _state: ActionResult<CommercialRate | null>,
  formData: FormData,
): Promise<ActionResult<CommercialRate | null>> {
  try {
    await requireAdminPermission("commercial_rates.manage");
    const rate = await createCommercialRateManagementService().publish(await getAuthenticatedUserId(), {
      purpose: text(formData, "purpose") as CommercialRatePurpose,
      rate: text(formData, "rate"),
      effectiveDate: text(formData, "effectiveDate"),
      sourceNote: text(formData, "sourceNote"),
      evidenceComment: text(formData, "evidenceComment") || null,
    });
    const unchanged = rate.id === text(formData, "currentRateId");
    if (!unchanged) {
      revalidatePath("/admin/commercial-rates");
      revalidatePath("/cabinet/catalog/[slug]", "page");
    }
    return success(
      unchanged
        ? "Курс уже актуален. Новая версия не создана."
        : "Новый курс опубликован.",
      rate,
    );
  } catch (error) {
    if (error instanceof CommercialRateValidationError) return invalidInput(error.message);
    return failureFromError(error);
  }
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

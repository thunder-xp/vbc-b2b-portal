"use server";

import { revalidatePath } from "next/cache";

import { failure, success, type ActionResult } from "./result";
import type {
  ManageMerchandisingInput,
  MerchandisingLabelCode,
  PublishedMerchandisingAssignment,
} from "../types";
import { MerchandisingValidationError } from "../services";
import { requireAdminPermission } from "../../admin/services";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { createMerchandisingService } from "./service-factory";

export async function manageMerchandisingAction(
  input: ManageMerchandisingInput,
): Promise<ActionResult<{ affected: number }>> {
  try {
    await requireAdminPermission("admin.catalog.manage");
    const affected = await createMerchandisingService().manage(input);
    revalidatePath("/admin/commercial/merchandising");
    revalidatePath("/cabinet/catalog");
    return success({ affected }, `Обновлено товаров: ${affected}.`);
  } catch (error) {
    if (error instanceof MerchandisingValidationError) {
      return failure(error.safeCode, merchandisingErrorMessage(error.safeCode));
    }
    console.error({
      event: "catalog_merchandising_mutation_failed",
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return failure(
      "MERCHANDISING_UPDATE_FAILED",
      "Не удалось обновить витрину каталога.",
    );
  }
}

export async function listPublishedMerchandisingAction(input?: {
  labelCode?: MerchandisingLabelCode;
  limitPerLabel?: number;
}): Promise<ActionResult<PublishedMerchandisingAssignment[]>> {
  try {
    const userId = await getAuthenticatedUserId();
    const assignments = await createMerchandisingService().listPublished(
      userId,
      input?.labelCode,
      input?.limitPerLabel,
    );
    return success(assignments, "Витрина каталога загружена.");
  } catch {
    return failure(
      "MERCHANDISING_UNAVAILABLE",
      "Подборки временно недоступны.",
    );
  }
}

function merchandisingErrorMessage(code: string): string {
  switch (code) {
    case "MERCHANDISING_EXPIRY_REQUIRED":
      return "Для новинки и горячего предложения укажите дату окончания.";
    case "MERCHANDISING_INTERVAL_INVALID":
    case "MERCHANDISING_DATE_INVALID":
      return "Проверьте период публикации.";
    default:
      return "Проверьте выбранные товары и параметры публикации.";
  }
}

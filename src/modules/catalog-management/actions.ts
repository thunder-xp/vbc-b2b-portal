"use server";

import { revalidatePath } from "next/cache";

import {
  ForbiddenError,
  PermissionRequiredError,
  UnauthenticatedError,
} from "../access-control/services";
import { requireAdminPermission } from "../admin/services";
import { CatalogManagementRepositoryError } from "./repository";
import {
  CatalogManagementService,
  CatalogManagementValidationError,
} from "./service";

export type CatalogManagementActionResult<T> =
  | { success: true; data: T; message: string }
  | { success: false; errorCode: string; message: string; correlationId: string };

export async function setCatalogProductVisibilityAction(input: {
  productId: string;
  visible: boolean;
  reason: string;
  correlationId: string;
}): Promise<CatalogManagementActionResult<{ visible: boolean; erpActiveUnchanged: true }>> {
  try {
    await requireAdminPermission("admin.catalog.manage");
    const result = await new CatalogManagementService().setVisibility(input);
    await revalidateCatalogSurfaces();
    return {
      success: true,
      data: { visible: result.visible, erpActiveUnchanged: true },
      message: result.visible ? "Товар опубликован в портале." : "Товар скрыт из портала.",
    };
  } catch (error) {
    const denied = error instanceof PermissionRequiredError
      || error instanceof ForbiddenError
      || error instanceof UnauthenticatedError;
    const errorCode = denied
      ? "CATALOG_MANAGEMENT_PERMISSION_DENIED"
      : error instanceof CatalogManagementValidationError || error instanceof CatalogManagementRepositoryError
        ? error.safeCode
        : "CATALOG_VISIBILITY_UNKNOWN_FAILURE";
    return {
      success: false,
      errorCode,
      message: denied
        ? "Недостаточно прав для управления каталогом."
        : `Не удалось изменить публикацию. Код: ${input.correlationId}.`,
      correlationId: input.correlationId,
    };
  }
}

export async function revalidateCatalogSurfaces(): Promise<void> {
  revalidatePath("/admin/catalog");
  revalidatePath("/admin/commercial/merchandising/preview");
  revalidatePath("/cabinet/catalog");
  revalidatePath("/catalog");
}

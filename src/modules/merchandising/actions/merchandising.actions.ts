"use server";

import { revalidatePath } from "next/cache";

import { failure, success, type ActionResult } from "./result";
import type {
  ManageMerchandisingInput,
  ManageMerchandisingResult,
  MerchandisingLabelCode,
  PublishedMerchandisingAssignment,
} from "../types";
import { MerchandisingRepositoryError } from "../repositories";
import { MerchandisingValidationError } from "../services";
import { requireAdminPermission } from "../../admin/services";
import {
  ForbiddenError,
  PermissionRequiredError,
  UnauthenticatedError,
} from "../../access-control/services";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { createMerchandisingService } from "./service-factory";

export async function manageMerchandisingAction(
  input: ManageMerchandisingInput,
): Promise<ActionResult<ManageMerchandisingResult>> {
  const correlationId = crypto.randomUUID();

  try {
    const context = await requireAdminPermission("admin.catalog.manage");
    console.info({
      event: "catalog_merchandising_mutation_started",
      correlationId,
      actorUserId: context.userId,
      permission: "admin.catalog.manage",
      operation: input.operation,
      productIds: input.productIds,
      labelCode: input.labelCode,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      priority: input.priority ?? 100,
      reasonLength: input.reason.trim().length,
      requestId: input.requestId,
      rpc: "manage_product_merchandising_v2",
    });

    const result = await createMerchandisingService().manage(input);
    revalidatePath("/admin/commercial/merchandising");
    revalidatePath("/admin/commercial/merchandising/preview");
    revalidatePath("/cabinet/catalog");
    return success(
      result,
      merchandisingSuccessMessage(result, input.operation),
    );
  } catch (error) {
    if (
      error instanceof PermissionRequiredError ||
      error instanceof ForbiddenError ||
      error instanceof UnauthenticatedError
    ) {
      return failure(
        "MERCHANDISING_PERMISSION_DENIED",
        merchandisingErrorMessage(
          "MERCHANDISING_PERMISSION_DENIED",
          correlationId,
        ),
        correlationId,
      );
    }

    if (error instanceof MerchandisingValidationError) {
      const safeCode = normalizeErrorCode(error.safeCode);
      return failure(
        safeCode,
        merchandisingErrorMessage(safeCode, correlationId),
        correlationId,
      );
    }

    if (error instanceof MerchandisingRepositoryError) {
      console.error({
        event: "catalog_merchandising_mutation_failed",
        correlationId,
        operation: input.operation,
        productIds: input.productIds,
        labelCode: input.labelCode,
        databaseCode: error.databaseCode,
        safeCode: error.safeCode,
        rpc: "manage_product_merchandising_v2",
      });
      return failure(
        error.safeCode,
        merchandisingErrorMessage(error.safeCode, correlationId),
        correlationId,
      );
    }

    console.error({
      event: "catalog_merchandising_mutation_failed",
      correlationId,
      errorType: error instanceof Error ? error.name : typeof error,
      operation: input.operation,
      productIds: input.productIds,
      labelCode: input.labelCode,
    });
    return failure(
      "MERCHANDISING_UNKNOWN_FAILURE",
      merchandisingErrorMessage("MERCHANDISING_UNKNOWN_FAILURE", correlationId),
      correlationId,
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

function merchandisingErrorMessage(
  code: string,
  correlationId: string,
): string {
  switch (code) {
    case "MERCHANDISING_PERMISSION_DENIED":
      return "Недостаточно прав для изменения витрины каталога.";
    case "MERCHANDISING_PRODUCT_NOT_FOUND":
      return "Товар не найден. Обновите список и повторите попытку.";
    case "MERCHANDISING_PRODUCT_INACTIVE":
      return "Неактивный товар нельзя публиковать в витрине.";
    case "MERCHANDISING_INVALID_LABEL":
      return "Выберите допустимую метку товара.";
    case "MERCHANDISING_INVALID_PERIOD":
      return "Проверьте даты: окончание должно быть позже начала.";
    case "MERCHANDISING_DUPLICATE_ASSIGNMENT":
      return "Операция неприменима к текущей метке. Обновите список.";
    case "MERCHANDISING_AUDIT_FAILURE":
      return `Изменение отменено: не удалось записать аудит. Код: ${correlationId}.`;
    case "MERCHANDISING_DATABASE_CONSTRAINT":
      return `Данные не прошли проверку. Проверьте параметры. Код: ${correlationId}.`;
    default:
      return `Не удалось обновить витрину. Сообщите администратору код ${correlationId}.`;
  }
}

function normalizeErrorCode(code: string): string {
  if (code === "MERCHANDISING_LABEL_INVALID") {
    return "MERCHANDISING_INVALID_LABEL";
  }
  if (
    code === "MERCHANDISING_INTERVAL_INVALID" ||
    code === "MERCHANDISING_DATE_INVALID" ||
    code === "MERCHANDISING_EXPIRY_REQUIRED"
  ) {
    return "MERCHANDISING_INVALID_PERIOD";
  }
  if (code === "MERCHANDISING_INPUT_INVALID") {
    return "MERCHANDISING_DATABASE_CONSTRAINT";
  }
  return code;
}

function merchandisingSuccessMessage(
  result: ManageMerchandisingResult,
  operation: ManageMerchandisingInput["operation"],
): string {
  const assignment = result.assignments[0];
  if (result.affected === 1 && assignment) {
    if (operation === "revoke") {
      return `Метка «${labelText(assignment.labelCode)}» отозвана у товара ${assignment.productName}.`;
    }
    if (operation === "hide") {
      return `Метка «${labelText(assignment.labelCode)}» скрыта для товара ${assignment.productName}.`;
    }
    return `Метка «${labelText(assignment.labelCode)}» назначена товару ${assignment.productName}.`;
  }
  return `Витрина обновлена. Товаров: ${result.affected}.`;
}

function labelText(labelCode: MerchandisingLabelCode): string {
  if (labelCode === "NEW") return "Новинка";
  if (labelCode === "TOP") return "Популярный";
  return "Горячая цена";
}

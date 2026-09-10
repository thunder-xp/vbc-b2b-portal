"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failureFromError } from "@/src/modules/access-control/actions/action-result";
import { requireAdminPermission } from "@/src/modules/admin/services";

import {
  createFailedRegistrationPurgeService,
  FAILED_REGISTRATION_PURGE_PERMISSION,
  FailedRegistrationPurgeError,
} from "../services/failed-registration-purge.service";
import type { FailedRegistrationPurgeResult } from "../types";

const purgeInputSchema = z.object({
  requestId: z.string().uuid(),
  userId: z.string().uuid(),
  email: z.string().trim().email().max(254),
  applicationName: z.string().trim().min(1).max(200),
  confirmationEmail: z.string().trim().email().max(254),
  confirmed: z.literal("on"),
});

export type FailedRegistrationPurgeActionState = {
  success: boolean;
  errorCode: string | null;
  message: string;
  data: FailedRegistrationPurgeResult | null;
  recoveryReceiptId: string | null;
};

export async function purgeFailedRegistrationAction(
  _previousState: FailedRegistrationPurgeActionState | null,
  formData: FormData,
): Promise<FailedRegistrationPurgeActionState> {
  const correlationId = randomUUID();
  try {
    const context = await requireAdminPermission(
      FAILED_REGISTRATION_PURGE_PERMISSION,
    );
    const input = purgeInputSchema.parse(Object.fromEntries(formData));
    if (input.confirmationEmail.toLowerCase() !== input.email.toLowerCase()) {
      return failureState(
        "CONFIRMATION_EMAIL_MISMATCH",
        "Введите точный email регистрации для подтверждения.",
      );
    }

    const result = await createFailedRegistrationPurgeService().purge({
      requestId: input.requestId,
      userId: input.userId,
      email: input.email,
      applicationName: input.applicationName,
      actorUserId: context.userId,
      correlationId,
    });

    console.info({
      event: "failed_registration_purge_completed",
      correlationId,
      receiptId: result.receiptId,
      requestId: input.requestId,
      targetUserId: input.userId,
      authDeletion: result.authDeletion,
      deletedCounts: result.deletedCounts,
    });
    revalidatePath("/admin/onboarding");
    revalidatePath(`/admin/onboarding/${input.requestId}`);
    return {
      success: true,
      errorCode: null,
      message: "Регистрация полностью сброшена. Email снова доступен для регистрации.",
      data: result,
      recoveryReceiptId: null,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return failureState(
        "INVALID_PURGE_CONFIRMATION",
        "Проверьте данные и явно подтвердите удаление регистрации.",
      );
    }
    if (error instanceof FailedRegistrationPurgeError) {
      console.error({
        event: "failed_registration_purge_failed",
        correlationId,
        errorCode: error.code,
        receiptId: error.receiptId,
        blockerCodes: error.blockerCodes,
      });
      return {
        success: false,
        errorCode: error.code,
        message: purgeErrorMessage(error),
        data: null,
        recoveryReceiptId: error.receiptId,
      };
    }

    const failure = failureFromError(error);
    return {
      ...failure,
      recoveryReceiptId: null,
    };
  }
}

function purgeErrorMessage(error: FailedRegistrationPurgeError): string {
  switch (error.code) {
    case "FAILED_REGISTRATION_NOT_FOUND":
      return "Регистрация уже отсутствует или больше недоступна для сброса.";
    case "FAILED_REGISTRATION_IDENTITY_MISMATCH":
      return "Данные пользователя не совпали. Сброс не выполнен.";
    case "FAILED_REGISTRATION_PURGE_BLOCKED":
      return "Сброс заблокирован: у пользователя есть защищённые связи или регистрация больше не соответствует условиям удаления.";
    case "AUTH_DELETE_FAILED_LOCAL_PURGED":
      return `Локальные данные удалены, но Auth-пользователь ещё требует безопасного повтора. Код восстановления: ${error.receiptId}.`;
    case "AUTH_DELETED_FINALIZATION_PENDING":
      return `Auth-пользователь удалён, но финальная проверка требует повтора. Код восстановления: ${error.receiptId}.`;
  }
}

function failureState(errorCode: string, message: string): FailedRegistrationPurgeActionState {
  return {
    success: false,
    errorCode,
    message,
    data: null,
    recoveryReceiptId: null,
  };
}

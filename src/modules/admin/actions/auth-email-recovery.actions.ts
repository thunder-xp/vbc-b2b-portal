"use server";

import {
  AuthEmailRecoveryError,
  createAuthEmailRecoveryService,
  requireAdminPermission,
  type AuthEmailRecoveryDiagnosis,
  type AuthEmailRecoveryErrorCode,
} from "../services";

export type AuthEmailRecoveryDiagnosticActionState = Readonly<{
  status: "idle" | "ready" | "error";
  message: string;
  diagnosis: AuthEmailRecoveryDiagnosis | null;
  correlationId: string | null;
}>;

export type AuthEmailRecoveryExecutionActionState = Readonly<{
  status: "idle" | "accepted" | "error" | "partial";
  message: string;
  correlationId: string | null;
}>;

export async function diagnoseAuthEmailRecoveryAction(
  _state: AuthEmailRecoveryDiagnosticActionState,
  formData: FormData,
): Promise<AuthEmailRecoveryDiagnosticActionState> {
  try {
    await requireAdminPermission("admin.security.manage");
    const diagnosis = await createAuthEmailRecoveryService().diagnose(String(formData.get("email") ?? ""));
    return {
      status: "ready",
      message: diagnosticMessage(diagnosis),
      diagnosis,
      correlationId: diagnosis.eligible ? crypto.randomUUID() : null,
    };
  } catch (error) {
    const code = safeErrorCode(error);
    console.error({ event: "auth_email_recovery_diagnostic_failed", errorCode: code });
    return { status: "error", message: errorMessage(code), diagnosis: null, correlationId: null };
  }
}

export async function executeAuthEmailRecoveryAction(
  _state: AuthEmailRecoveryExecutionActionState,
  formData: FormData,
): Promise<AuthEmailRecoveryExecutionActionState> {
  const correlationId = String(formData.get("correlationId") ?? "");
  try {
    const context = await requireAdminPermission("admin.security.manage");
    const result = await createAuthEmailRecoveryService().execute({
      actorUserId: context.userId,
      authUserId: String(formData.get("authUserId") ?? ""),
      correlationId,
      originalErrorConfirmed: formData.get("originalErrorConfirmed") === "on",
      mailboxValidityConfirmed: formData.get("mailboxValidityConfirmed") === "on",
      explicitlyAuthorized: formData.get("explicitlyAuthorized") === "on",
    });
    return {
      status: "accepted",
      message: result.idempotent
        ? "Письмо уже было принято резервным каналом; повторная отправка не выполнена."
        : "Резервное письмо принято почтовым провайдером. Повторная отправка заблокирована.",
      correlationId: result.correlationId,
    };
  } catch (error) {
    const code = safeErrorCode(error);
    const partial = code === "AUDIT_FAILED_AFTER_DELIVERY";
    console.error({
      event: "auth_email_recovery_execution_failed",
      correlationId: isUuid(correlationId) ? correlationId : null,
      errorCode: code,
      partial,
    });
    return {
      status: partial ? "partial" : "error",
      message: errorMessage(code),
      correlationId: isUuid(correlationId) ? correlationId : null,
    };
  }
}

function diagnosticMessage(diagnosis: AuthEmailRecoveryDiagnosis): string {
  if (diagnosis.identityState === "UNKNOWN") return "Auth-пользователь не найден. Резервное действие недоступно.";
  if (diagnosis.identityState === "AMBIGUOUS") return "Найдена неоднозначная Auth-идентичность. Отправка запрещена.";
  if (diagnosis.identityState === "CONFIRMED") return "Email уже подтверждён. Резервная отправка не требуется.";
  if (!diagnosis.eligible) return "Для этой идентичности уже существует активная или завершённая резервная попытка.";
  return "Идентичность подходит для контролируемого восстановления после проверки доказательств.";
}

function safeErrorCode(error: unknown): AuthEmailRecoveryErrorCode {
  if (error instanceof AuthEmailRecoveryError) return error.code;
  if (error instanceof Error && ["ForbiddenError", "PermissionRequiredError", "UnauthenticatedError"].includes(error.name)) {
    return "SYSTEM_ERROR";
  }
  return "SYSTEM_ERROR";
}

function errorMessage(code: AuthEmailRecoveryErrorCode): string {
  return {
    INVALID_INPUT: "Проверьте идентификаторы и адрес email.",
    EVIDENCE_REQUIRED: "Подтвердите все обязательные доказательства и явное разрешение.",
    IDENTITY_UNKNOWN: "Auth-идентичность не найдена. Пользователь не создавался.",
    IDENTITY_AMBIGUOUS: "Auth-идентичность неоднозначна. Отправка запрещена.",
    ALREADY_CONFIRMED: "Email уже подтверждён. Отправка не выполнена.",
    RATE_LIMITED: "Лимит восстановления достигнут. Отправка не выполнена.",
    IN_PROGRESS: "Восстановление уже выполняется. Повторная отправка запрещена.",
    PREVIOUSLY_FAILED: "Эта команда уже завершилась ошибкой. Создайте новую явную попытку после интервала безопасности.",
    GENERATION_FAILED: "Supabase не создал ссылку подтверждения. Письмо не отправлено.",
    DELIVERY_FAILED: "Почтовый провайдер отклонил отправку. Автоматического повтора нет.",
    AUDIT_FAILED_AFTER_DELIVERY: "Провайдер принял письмо, но финальная запись аудита не подтверждена. Повторять отправку нельзя.",
    SYSTEM_ERROR: "Операция недоступна. Отправка не выполнена.",
  }[code];
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

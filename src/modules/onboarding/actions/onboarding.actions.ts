"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getOneCEnv } from "@/src/lib/env";
import {
  emitRequestTotal,
  measurePerformanceStage,
} from "@/src/lib/performance/request-diagnostics";
import { createClient } from "@/src/lib/supabase/server";
import {
  failureFromError,
  success,
  type ActionResult,
} from "@/src/modules/access-control/actions/action-result";
import { requireAdminPermission } from "@/src/modules/admin/services";
import { normalizeFiscalCode } from "@/src/modules/company-identity/fiscal-code";

import {
  ONBOARDING_BUSINESS_PROFILE_CODES,
  ONBOARDING_PAYMENT_MODELS,
} from "../business-profiles";
import {
  CLARIFICATION_REASON_CODES,
  ONBOARDING_STATUSES,
  PARTNER_CORRECTION_FIELDS,
  REJECTION_REASON_CODES,
  type OnboardingDetail,
  type OnboardingHealth,
  type OnboardingQueue,
  type PartnerOnboardingStatusCenter,
} from "../types";
import { SupabaseOnboardingRepository, type OnboardingQueueInput } from "../repositories";
import {
  CounterpartyDirectorySyncInProgressError,
  CounterpartyDirectorySyncService,
  OnboardingApplicationError,
  OnboardingApplicationService,
  OneCCounterpartyDirectorySource,
} from "../services";

const uuidSchema = z.string().uuid();
const transitionSchema = z.enum(ONBOARDING_STATUSES);
const accessProfileSchema = z.enum([
  "owner",
  "manager",
  "buyer",
  "accounting",
  "retail_only",
]);
const businessProfileSchema = z.enum(ONBOARDING_BUSINESS_PROFILE_CODES);
const paymentModelSchema = z.enum(ONBOARDING_PAYMENT_MODELS);
const clarificationReasonSchema = z.enum(CLARIFICATION_REASON_CODES);
const rejectionReasonSchema = z.enum(REJECTION_REASON_CODES);
const correctionFieldSchema = z.enum(PARTNER_CORRECTION_FIELDS);
const partnerRevisionSchema = z.object({
  expectedRevision: z.coerce.number().int().positive(),
  companyName: z.string().trim().min(2).max(200),
  fiscalCode: z.string().trim().max(64),
  contactName: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(5).max(50),
  email: z.string().trim().email().max(254),
  locality: z.string().trim().max(160),
  businessType: z.string().trim().max(160),
  businessActivity: z.string().trim().max(1000),
  estimatedPurchasingVolume: z.string().trim().max(160),
  comment: z.string().trim().max(2000),
});

export type OnboardingWizardActionState = ActionResult<null>;
export type OnboardingWorkflowActionState = ActionResult<null>;
export type OnboardingDirectoryRefreshActionState = ActionResult<{
  correlationId: string;
  deduplicated: boolean;
  published: number | null;
}>;
export type OnboardingCandidateRematchActionState = ActionResult<{
  correlationId: string;
  matchOutcome: OnboardingDetail["companyVerification"]["matchOutcome"];
  exactCandidateCount: number;
}>;

export async function listOnboardingQueueAction(
  input: OnboardingQueueInput,
): Promise<ActionResult<OnboardingQueue>> {
  try {
    await measurePerformanceStage("onboarding_queue", "access_context", () =>
      requireAdminPermission("onboarding.requests.view"),
    );
    const queue = await measurePerformanceStage("onboarding_queue", "queue_rpc", () =>
      new SupabaseOnboardingRepository().listQueue(input),
    );
    return success("Очередь онбординга загружена.", queue);
  } catch (error) {
    return failureFromError(error);
  } finally {
    emitRequestTotal("onboarding_queue");
  }
}

export async function getOnboardingDetailAction(
  requestId: string,
): Promise<ActionResult<OnboardingDetail>> {
  try {
    await measurePerformanceStage("onboarding_detail", "access_context", () =>
      requireAdminPermission("onboarding.requests.view"),
    );
    const detail = await measurePerformanceStage("onboarding_detail", "detail_rpc", () =>
      new OnboardingApplicationService(new SupabaseOnboardingRepository()).getDetail(requestId),
    );
    return success("Заявка загружена.", detail);
  } catch (error) {
    if (error instanceof OnboardingApplicationError) {
      return {
        success: false,
        errorCode: error.code,
        message: onboardingApplicationErrorMessage(error.code),
        data: null,
      };
    }
    return failureFromError(error);
  } finally {
    emitRequestTotal("onboarding_detail");
  }
}

function onboardingApplicationErrorMessage(code: OnboardingApplicationError["code"]): string {
  return {
    ONBOARDING_APPLICATION_NOT_FOUND: "Заявка не найдена.",
    ONBOARDING_ACCESS_DENIED: "Недостаточно прав для просмотра заявки.",
    ONBOARDING_INVALID_STATE: "Заявка недоступна в текущем состоянии.",
    ONBOARDING_1C_MATCH_REQUIRED: "Подтвердите соответствие контрагенту 1С.",
    ONBOARDING_ALREADY_DECIDED: "По заявке уже принято решение.",
    ONBOARDING_ACTIVATION_FAILED: "Не удалось активировать доступ партнёра.",
    ONBOARDING_LOAD_FAILED: "Не удалось загрузить заявку. Повторите попытку.",
  }[code];
}

export async function getOnboardingHealthAction(): Promise<ActionResult<OnboardingHealth>> {
  try {
    await requireAdminPermission("onboarding.requests.view");
    const health = await new SupabaseOnboardingRepository().getHealth();
    return success("Состояние онбординга загружено.", health);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function getOwnOnboardingStatusAction(): Promise<ActionResult<PartnerOnboardingStatusCenter | null>> {
  try {
    const status = await new SupabaseOnboardingRepository().getOwnStatusCenter();
    return success("Статус заявки загружен.", status);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function requestOnboardingClarificationAction(
  _previousState: OnboardingWorkflowActionState,
  formData: FormData,
): Promise<OnboardingWorkflowActionState> {
  return mutateWorkflow(async () => {
    await requireAdminPermission("onboarding.requests.review");
    const requestId = uuidSchema.parse(formData.get("requestId"));
    const fields = formData.getAll("fields").map((value) => correctionFieldSchema.parse(value));
    if (fields.length === 0) throw new Error("clarification_fields_required");
    await new SupabaseOnboardingRepository().requestClarification({
      requestId,
      expectedRevision: positiveInteger(formData.get("requestRevision")),
      reasonCategory: clarificationReasonSchema.parse(formData.get("reasonCategory")),
      partnerMessage: requiredBoundedText(formData, "partnerMessage", 10, 1200),
      fields,
      responseDeadline: optionalText(formData, "responseDeadline", 10),
      internalNote: optionalText(formData, "internalNote", 2000),
    });
    revalidateOnboarding(requestId);
    revalidatePath("/onboarding/waiting");
    return "Запрос на уточнение отправлен партнёру.";
  });
}

export async function rejectOnboardingRequestAction(
  _previousState: OnboardingWorkflowActionState,
  formData: FormData,
): Promise<OnboardingWorkflowActionState> {
  return mutateWorkflow(async () => {
    await requireAdminPermission("onboarding.requests.reject");
    const requestId = uuidSchema.parse(formData.get("requestId"));
    await new SupabaseOnboardingRepository().reject({
      requestId,
      expectedRevision: positiveInteger(formData.get("requestRevision")),
      reasonCategory: rejectionReasonSchema.parse(formData.get("reasonCategory")),
      partnerMessage: requiredBoundedText(formData, "partnerMessage", 10, 1200),
      internalNote: optionalText(formData, "internalNote", 2000),
    });
    revalidateOnboarding(requestId);
    revalidatePath("/onboarding/waiting");
    return "Заявка отклонена.";
  });
}

export async function cancelOwnOnboardingRequestAction(
  _previousState: OnboardingWorkflowActionState,
  formData: FormData,
): Promise<OnboardingWorkflowActionState> {
  return mutateWorkflow(async () => {
    if (formData.get("confirmed") !== "on") throw new Error("confirmation_required");
    await new SupabaseOnboardingRepository().cancelOwn();
    revalidatePath("/onboarding/waiting");
    revalidatePath("/onboarding/access-request");
    return "Заявка отменена.";
  });
}

export async function cancelOnboardingRequestInternalAction(
  _previousState: OnboardingWorkflowActionState,
  formData: FormData,
): Promise<OnboardingWorkflowActionState> {
  return mutateWorkflow(async () => {
    await requireAdminPermission("onboarding.requests.reject");
    const requestId = uuidSchema.parse(formData.get("requestId"));
    await new SupabaseOnboardingRepository().cancelInternal(
      requestId,
      rejectionReasonSchema.parse(formData.get("reasonCategory")),
      requiredBoundedText(formData, "internalNote", 3, 2000),
    );
    revalidateOnboarding(requestId);
    revalidatePath("/onboarding/waiting");
    return "Заявка отменена менеджером.";
  });
}

export async function reopenOnboardingRequestAction(
  _previousState: OnboardingWorkflowActionState,
  formData: FormData,
): Promise<OnboardingWorkflowActionState> {
  return mutateWorkflow(async () => {
    const context = await requireAdminPermission("admin.permissions.manage");
    if (!context.isPlatformAdmin) throw new Error("permission_denied");
    const requestId = uuidSchema.parse(formData.get("requestId"));
    await new SupabaseOnboardingRepository().reopen(
      requestId,
      uuidSchema.parse(formData.get("assigneeUserId")),
      requiredBoundedText(formData, "reason", 3, 500),
    );
    revalidateOnboarding(requestId);
    revalidatePath("/onboarding/waiting");
    return "Заявка возвращена на проверку.";
  });
}

export async function submitOnboardingPartnerRevisionAction(
  _previousState: OnboardingWorkflowActionState,
  formData: FormData,
): Promise<OnboardingWorkflowActionState> {
  return mutateWorkflow(async () => {
    const input = partnerRevisionSchema.parse(Object.fromEntries(formData));
    const fiscalCode = normalizeFiscalCode(input.fiscalCode);
    if (!fiscalCode) throw new Error("invalid_fiscal_code");
    await new SupabaseOnboardingRepository().submitPartnerRevision({ ...input, fiscalCode });
    revalidatePath("/onboarding/waiting");
    revalidatePath("/admin/onboarding");
    return "Обновлённая заявка отправлена на проверку.";
  });
}

export async function assignOnboardingRequestFormAction(
  formData: FormData,
): Promise<void> {
  await requireAdminPermission("onboarding.requests.assign");
  const requestId = uuidSchema.parse(formData.get("requestId"));
  const assigneeValue = formData.get("assigneeUserId");
  let assigneeUserId: string;
  if (assigneeValue === "self") {
    const client = await createClient();
    const { data } = await client.auth.getUser();
    assigneeUserId = uuidSchema.parse(data.user?.id);
  } else {
    assigneeUserId = uuidSchema.parse(assigneeValue);
  }
  await new SupabaseOnboardingRepository().assign(requestId, assigneeUserId);
  revalidateOnboarding(requestId);
}

export async function unassignOnboardingRequestFormAction(
  formData: FormData,
): Promise<void> {
  await requireAdminPermission("onboarding.requests.assign");
  const requestId = uuidSchema.parse(formData.get("requestId"));
  await new SupabaseOnboardingRepository().unassign(requestId);
  revalidateOnboarding(requestId);
}

export async function transitionOnboardingRequestFormAction(
  formData: FormData,
): Promise<void> {
  await requireAdminPermission("onboarding.requests.review");
  const requestId = uuidSchema.parse(formData.get("requestId"));
  const nextStatus = transitionSchema.parse(formData.get("nextStatus"));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  await new SupabaseOnboardingRepository().transition(
    requestId,
    nextStatus,
    reason,
  );
  revalidateOnboarding(requestId);
}

export async function confirmOnboardingMatchFormAction(
  formData: FormData,
): Promise<void> {
  await requireAdminPermission("onboarding.company_match.confirm");
  const requestId = uuidSchema.parse(formData.get("requestId"));
  const counterpartyId = uuidSchema.parse(formData.get("counterpartyId"));
  const initialAccessProfile = accessProfileSchema.parse(
    formData.get("initialAccessProfile"),
  );
  await new SupabaseOnboardingRepository().confirmMatch(
    requestId,
    counterpartyId,
    initialAccessProfile,
  );
  revalidateOnboarding(requestId);
}

export async function synchronizeCounterpartyDirectoryFormAction(): Promise<void> {
  await requireAdminPermission("admin.integrations.manage");
  const service = new CounterpartyDirectorySyncService(
    new OneCCounterpartyDirectorySource(getOneCEnv()),
  );
  await service.synchronize();
  revalidatePath("/admin/onboarding");
}

export async function refreshOnboardingDirectoryAction(
  _previousState: OnboardingDirectoryRefreshActionState,
  formData: FormData,
): Promise<OnboardingDirectoryRefreshActionState> {
  const correlationId = randomUUID();
  let requestId: string | null = null;
  const repository = new SupabaseOnboardingRepository();

  try {
    await requireAdminPermission("admin.integrations.manage");
    requestId = uuidSchema.parse(formData.get("requestId"));
    await repository.recordDirectoryRefreshEvent({
      requestId,
      eventType: "directory_refresh_requested",
      correlationId,
    });
    const result = await new CounterpartyDirectorySyncService(
      new OneCCounterpartyDirectorySource(getOneCEnv()),
    ).synchronize();
    await repository.recordDirectoryRefreshEvent({
      requestId,
      eventType: "directory_refresh_succeeded",
      correlationId,
    });
    revalidateOnboarding(requestId);
    return success("Справочник 1С обновлён. Кандидаты проверены повторно.", {
      correlationId,
      deduplicated: false,
      published: result.published,
    });
  } catch (error) {
    if (error instanceof CounterpartyDirectorySyncInProgressError) {
      if (requestId) revalidateOnboarding(requestId);
      return success("Обновление справочника 1С уже выполняется. Повторный запуск не создан.", {
        correlationId,
        deduplicated: true,
        published: null,
      });
    }
    if (requestId) {
      try {
        await repository.recordDirectoryRefreshEvent({
          requestId,
          eventType: "directory_refresh_failed",
          correlationId,
          safeErrorCode: safeActionErrorCode(error),
        });
      } catch (auditError) {
        console.error({
          event: "onboarding_directory_refresh_audit_failed",
          correlationId,
          errorType: auditError instanceof Error ? auditError.name : typeof auditError,
        });
      }
    }
    console.error({
      event: "onboarding_directory_refresh_failed",
      correlationId,
      requestId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      errorCode: "ONBOARDING_DIRECTORY_REFRESH_FAILED",
      message: `Не удалось обновить справочник 1С. Повторите позже. Код обращения: ${correlationId}`,
      data: null,
    };
  }
}

export async function rematchOnboardingCandidatesAction(
  _previousState: OnboardingCandidateRematchActionState,
  formData: FormData,
): Promise<OnboardingCandidateRematchActionState> {
  const correlationId = randomUUID();
  try {
    await requireAdminPermission("onboarding.company_match.view");
    const requestId = uuidSchema.parse(formData.get("requestId"));
    const detail = await new OnboardingApplicationService(
      new SupabaseOnboardingRepository(),
    ).getDetail(requestId);
    revalidateOnboarding(requestId);
    console.info({
      event: "onboarding_candidates_rematched",
      requestId,
      correlationId,
      matchOutcome: detail.companyVerification.matchOutcome,
      exactCandidateCount: detail.companyVerification.exactCandidateCount,
    });
    return success("Кандидаты повторно сопоставлены с опубликованным справочником.", {
      correlationId,
      matchOutcome: detail.companyVerification.matchOutcome,
      exactCandidateCount: detail.companyVerification.exactCandidateCount,
    });
  } catch (error) {
    console.error({
      event: "onboarding_candidate_rematch_failed",
      correlationId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      errorCode: "ONBOARDING_CANDIDATE_REMATCH_FAILED",
      message: `Не удалось повторно сопоставить кандидатов. Код обращения: ${correlationId}`,
      data: null,
    };
  }
}

export async function markOnboardingCounterpartyAbsentAction(
  _previousState: OnboardingWorkflowActionState,
  formData: FormData,
): Promise<OnboardingWorkflowActionState> {
  return mutateWorkflow(async () => {
    await requireAdminPermission("onboarding.requests.review");
    const requestId = uuidSchema.parse(formData.get("requestId"));
    const assignee = String(formData.get("assigneeUserId") ?? "").trim();
    await new SupabaseOnboardingRepository().markWaitingForOneCCounterparty({
      requestId,
      assigneeUserId: assignee ? uuidSchema.parse(assignee) : null,
      internalNote: optionalText(formData, "internalNote", 1000),
      correlationId: randomUUID(),
    });
    revalidateOnboarding(requestId);
    return "Заявка сохранена в ожидании создания контрагента в 1С.";
  });
}

export async function saveOnboardingCompanyStepAction(
  _previousState: OnboardingWizardActionState,
  formData: FormData,
): Promise<OnboardingWizardActionState> {
  return mutateWizard(async () => {
    await requireAdminPermission("onboarding.company_match.confirm");
    const input = parseDraftBase(formData);
    await new SupabaseOnboardingRepository().saveApprovalDraft({
      ...input,
      step: 1,
      counterpartyId: uuidSchema.parse(formData.get("counterpartyId")),
    });
    revalidateOnboarding(input.requestId);
    return "Компания подтверждена.";
  });
}

export async function saveOnboardingCommercialStepAction(
  _previousState: OnboardingWizardActionState,
  formData: FormData,
): Promise<OnboardingWizardActionState> {
  return mutateWizard(async () => {
    await requireAdminPermission("onboarding.initial_access.assign");
    const input = parseDraftBase(formData);
    const priceProfile = String(formData.get("priceProfileId") ?? "").trim();
    await new SupabaseOnboardingRepository().saveApprovalDraft({
      ...input,
      step: 2,
      assignedManagerId: uuidSchema.parse(formData.get("assignedManagerId")),
      priceProfileId: priceProfile ? uuidSchema.parse(priceProfile) : null,
      paymentModel: paymentModelSchema.parse(formData.get("paymentModel")),
      financeAccess: formData.get("financeAccess") === "on",
      orderAccess: formData.get("orderAccess") === "on",
    });
    revalidateOnboarding(input.requestId);
    return "Коммерческие условия сохранены.";
  });
}

export async function saveOnboardingProfileStepAction(
  _previousState: OnboardingWizardActionState,
  formData: FormData,
): Promise<OnboardingWizardActionState> {
  return mutateWizard(async () => {
    await requireAdminPermission("onboarding.initial_access.assign");
    const input = parseDraftBase(formData);
    await new SupabaseOnboardingRepository().saveApprovalDraft({
      ...input,
      step: 3,
      initialProfile: businessProfileSchema.parse(formData.get("initialProfile")),
    });
    revalidateOnboarding(input.requestId);
    return "Профиль пользователя сохранён.";
  });
}

export async function moveOnboardingWizardStepAction(
  _previousState: OnboardingWizardActionState,
  formData: FormData,
): Promise<OnboardingWizardActionState> {
  return mutateWizard(async () => {
    await requireAdminPermission("onboarding.requests.review");
    const requestId = uuidSchema.parse(formData.get("requestId"));
    await new SupabaseOnboardingRepository().setApprovalDraftStep(
      requestId,
      positiveInteger(formData.get("draftVersion")),
      z.coerce.number().int().min(1).max(4).parse(formData.get("step")),
    );
    revalidateOnboarding(requestId);
    return "Шаг изменён.";
  });
}

export async function resetOnboardingDraftAction(
  _previousState: OnboardingWizardActionState,
  formData: FormData,
): Promise<OnboardingWizardActionState> {
  return mutateWizard(async () => {
    await requireAdminPermission("onboarding.requests.review");
    const requestId = uuidSchema.parse(formData.get("requestId"));
    await new SupabaseOnboardingRepository().resetApprovalDraft(requestId);
    revalidateOnboarding(requestId);
    return "Черновик обновлён по последней редакции заявки.";
  });
}

export async function approveOnboardingRequestV3Action(
  _previousState: OnboardingWizardActionState,
  formData: FormData,
): Promise<OnboardingWizardActionState> {
  return mutateWizard(async () => {
    await requireAdminPermission("onboarding.requests.approve");
    if (formData.get("confirmed") !== "on") {
      throw new Error("confirmation_required");
    }
    const input = parseDraftBase(formData);
    const result = await new SupabaseOnboardingRepository().approve({
      requestId: input.requestId,
      expectedRequestRevision: input.expectedRequestRevision,
      expectedDraftVersion: input.expectedDraftVersion,
      attemptKey: uuidSchema.parse(formData.get("attemptKey")),
      correlationId: crypto.randomUUID(),
    });
    revalidateOnboarding(input.requestId);
    revalidatePath("/onboarding/waiting");
    revalidatePath("/cabinet");
    if (!result.success) {
      throw new WizardMutationError(
        result.failureCode ?? "unknown_retryable",
        result.correlationId,
      );
    }
    return result.idempotent
      ? "Доступ уже был открыт. Результат подтверждён повторно."
      : "Доступ к кабинету открыт.";
  });
}

export async function openOnboardingRequestFormAction(
  formData: FormData,
): Promise<void> {
  redirect(`/admin/onboarding/${uuidSchema.parse(formData.get("requestId"))}`);
}

function revalidateOnboarding(requestId: string): void {
  revalidatePath("/admin/onboarding");
  revalidatePath(`/admin/onboarding/${requestId}`);
}

function parseDraftBase(formData: FormData) {
  return {
    requestId: uuidSchema.parse(formData.get("requestId")),
    expectedRequestRevision: positiveInteger(formData.get("requestRevision")),
    expectedDraftVersion: positiveInteger(formData.get("draftVersion")),
  };
}

function positiveInteger(value: FormDataEntryValue | null): number {
  return z.coerce.number().int().positive().parse(value);
}

function optionalText(formData: FormData, key: string, maxLength: number): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value.slice(0, maxLength) : null;
}

function requiredBoundedText(
  formData: FormData,
  key: string,
  minLength: number,
  maxLength: number,
): string {
  return z.string().trim().min(minLength).max(maxLength).parse(formData.get(key));
}

async function mutateWorkflow(
  mutation: () => Promise<string>,
): Promise<OnboardingWorkflowActionState> {
  try {
    return success(await mutation(), null);
  } catch (error) {
    const correlationId = crypto.randomUUID();
    const reason = extractSafeReason(error);
    console.error({ event: "onboarding_workflow_mutation_failed", reason, correlationId });
    const message = {
      stale_request_revision: "Заявка уже изменилась. Обновите страницу и повторите действие.",
      invalid_status_transition: "Это действие больше недоступно для текущего статуса.",
      permission_denied: "Недостаточно прав для выполнения действия.",
      clarification_fields_required: "Выберите хотя бы одно поле для уточнения.",
    }[reason] ?? "Не удалось сохранить изменение. Данные не потеряны; обновите страницу и повторите попытку.";
    return { success: false, errorCode: reason, message: `${message} Код события: ${correlationId}.`, data: null };
  }
}

async function mutateWizard(
  mutation: () => Promise<string>,
): Promise<OnboardingWizardActionState> {
  try {
    const message = await mutation();
    return success(message, null);
  } catch (error) {
    const correlationId = error instanceof WizardMutationError
      ? error.correlationId
      : crypto.randomUUID();
    const reason = extractSafeReason(error);
    console.error({
      event: "onboarding_approval_wizard_mutation_failed",
      reason,
      correlationId,
    });
    return {
      success: false,
      errorCode: reason,
      message: `${approvalFailureMessage(reason)} Код события: ${correlationId}.`,
      data: null,
    };
  }
}

function extractSafeReason(error: unknown): string {
  if (error instanceof WizardMutationError) return error.code;
  if (error instanceof Error && error.message === "confirmation_required") {
    return error.message;
  }
  const cause = error instanceof Error
    ? (error as Error & { cause?: unknown }).cause
    : null;
  if (cause && typeof cause === "object" && "message" in cause) {
    const message = String((cause as { message?: unknown }).message ?? "");
    const known = [
      "stale_request_revision",
      "stale_approval_draft",
      "counterparty_snapshot_stale",
      "duplicate_company_conflict",
      "counterparty_already_linked",
      "user_membership_conflict",
      "invalid_price_profile",
      "invalid_initial_profile",
      "permission_denied",
      "invalid_status_transition",
      "clarification_fields_required",
      "invalid_clarification_reason",
      "invalid_rejection_reason",
      "invalid_fiscal_code",
    ].find((code) => message.includes(code));
    if (known) return known;
  }
  return "unknown_retryable";
}

function safeActionErrorCode(error: unknown): string {
  const value = error instanceof Error ? error.name : typeof error;
  return value.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 80) || "UNKNOWN";
}

class WizardMutationError extends Error {
  readonly code: string;
  readonly correlationId: string;

  constructor(code: string, correlationId = crypto.randomUUID()) {
    super(code);
    this.name = "WizardMutationError";
    this.code = code;
    this.correlationId = correlationId;
  }
}

function approvalFailureMessage(code?: string, correlationId?: string): string {
  const message = {
    confirmation_required: "Подтвердите, что компания и условия доступа проверены.",
    stale_request_revision: "Заявка изменилась. Обновите черновик перед продолжением.",
    stale_approval_draft: "Черновик изменён другим менеджером. Обновите страницу.",
    counterparty_snapshot_stale: "Справочник 1С обновился. Подтвердите компанию заново.",
    duplicate_company_conflict: "Обнаружен конфликт компании. Требуется проверка администратора.",
    counterparty_already_linked: "Контрагент уже связан с другой компанией портала.",
    user_membership_conflict: "Пользователь уже связан с другой компанией.",
    invalid_price_profile: "Выбранный статус партнёра недоступен для этой компании.",
    invalid_initial_profile: "Выбранный профиль доступа недоступен.",
    permission_denied: "Недостаточно прав для выполнения операции.",
    unknown_retryable: "Не удалось завершить подключение. Черновик сохранён; повторите попытку.",
  }[code ?? "unknown_retryable"] ?? "Не удалось завершить подключение. Черновик сохранён.";
  return correlationId ? `${message} Код события: ${correlationId}.` : message;
}

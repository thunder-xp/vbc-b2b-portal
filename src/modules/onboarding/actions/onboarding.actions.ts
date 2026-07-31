"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getOneCEnv } from "@/src/lib/env";
import { createClient } from "@/src/lib/supabase/server";
import {
  failureFromError,
  success,
  type ActionResult,
} from "@/src/modules/access-control/actions/action-result";
import { requireAdminPermission } from "@/src/modules/admin/services";

import {
  ONBOARDING_BUSINESS_PROFILE_CODES,
  ONBOARDING_PAYMENT_MODELS,
} from "../business-profiles";
import {
  ONBOARDING_STATUSES,
  type OnboardingDetail,
  type OnboardingHealth,
  type OnboardingQueue,
} from "../types";
import { SupabaseOnboardingRepository, type OnboardingQueueInput } from "../repositories";
import {
  CounterpartyDirectorySyncService,
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

export type OnboardingWizardActionState = ActionResult<null>;

export async function listOnboardingQueueAction(
  input: OnboardingQueueInput,
): Promise<ActionResult<OnboardingQueue>> {
  try {
    await requireAdminPermission("onboarding.requests.view");
    const queue = await new SupabaseOnboardingRepository().listQueue(input);
    return success("Очередь онбординга загружена.", queue);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function getOnboardingDetailAction(
  requestId: string,
): Promise<ActionResult<OnboardingDetail | null>> {
  try {
    await requireAdminPermission("onboarding.requests.view");
    const detail = await new SupabaseOnboardingRepository().getDetail(
      uuidSchema.parse(requestId),
    );
    return success("Заявка загружена.", detail);
  } catch (error) {
    return failureFromError(error);
  }
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
    ].find((code) => message.includes(code));
    if (known) return known;
  }
  return "unknown_retryable";
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

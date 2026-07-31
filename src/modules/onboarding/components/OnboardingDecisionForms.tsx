"use client";

import { useActionState } from "react";

import {
  cancelOnboardingRequestInternalAction,
  rejectOnboardingRequestAction,
  reopenOnboardingRequestAction,
  requestOnboardingClarificationAction,
  type OnboardingWorkflowActionState,
} from "../actions";
import type { OnboardingDetail } from "../types";

const initialState: OnboardingWorkflowActionState = {
  success: true,
  errorCode: null,
  message: "",
  data: null,
};

const correctionFields = [
  ["company_name", "Название компании"],
  ["fiscal_code", "Фискальный код"],
  ["contact_name", "Контактное лицо"],
  ["phone", "Телефон"],
  ["email", "Электронная почта"],
  ["locality", "Населённый пункт"],
  ["business_type", "Тип бизнеса"],
  ["business_activity", "Направление деятельности"],
  ["estimated_purchasing_volume", "Ожидаемый объём закупок"],
  ["comment", "Комментарий"],
] as const;

const clarificationReasons = [
  ["company_data_incomplete", "Недостаточно данных о компании"],
  ["fiscal_code_needs_confirmation", "Нужно подтвердить фискальный код"],
  ["contact_details_incomplete", "Недостаточно контактных данных"],
  ["business_activity_unclear", "Нужно уточнить деятельность"],
  ["existing_company_conflict", "Конфликт с существующей компанией"],
  ["1c_company_not_found", "Компания не найдена в 1С"],
  ["additional_documents_required", "Нужны дополнительные документы"],
  ["other", "Другая причина"],
] as const;

const rejectionReasons = [
  ["duplicate_application", "Повторная заявка"],
  ["company_not_verified", "Компания не подтверждена"],
  ["invalid_information", "Некорректные сведения"],
  ["unsupported_business_type", "Неподдерживаемый тип деятельности"],
  ["existing_membership", "Доступ уже существует"],
  ["company_access_conflict", "Конфликт доступа к компании"],
  ["not_eligible", "Не соответствует условиям партнёрства"],
  ["cancelled_by_applicant", "Отменено по просьбе заявителя"],
  ["other", "Другая причина"],
] as const;

export function OnboardingDecisionForms({ detail }: { detail: OnboardingDetail }) {
  const terminal = ["approved", "rejected", "cancelled"].includes(detail.request.status);
  const [clarificationState, clarificationAction, clarificationPending] = useActionState(
    requestOnboardingClarificationAction,
    initialState,
  );
  const [rejectionState, rejectionAction, rejectionPending] = useActionState(
    rejectOnboardingRequestAction,
    initialState,
  );
  const [cancellationState, cancellationAction, cancellationPending] = useActionState(
    cancelOnboardingRequestInternalAction,
    initialState,
  );
  const [reopenState, reopenAction, reopenPending] = useActionState(
    reopenOnboardingRequestAction,
    initialState,
  );

  if (detail.request.status === "approved") return null;
  if (terminal && !detail.workflow.isPlatformAdmin) return null;

  return (
    <section className="border-b border-zinc-200 bg-white pb-6">
      <h2 className="mb-4 text-lg font-semibold">Решение по заявке</h2>
      {!terminal ? (
        <div className="space-y-3">
          {(["received", "under_review"] as const).includes(
            detail.request.status as "received" | "under_review",
          ) ? (
            <details className="border border-zinc-200 p-4">
              <summary className="cursor-pointer font-semibold">Запросить уточнение</summary>
              <form action={clarificationAction} className="mt-4 grid gap-4">
                <RequestIdentity detail={detail} />
                <SelectField name="reasonCategory" label="Причина" options={clarificationReasons} />
                <fieldset>
                  <legend className="text-sm font-semibold">Что требуется исправить</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {correctionFields.map(([value, label]) => (
                      <label key={value} className="flex min-h-11 items-center gap-2 text-sm">
                        <input type="checkbox" name="fields" value={value} />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <TextArea name="partnerMessage" label="Сообщение партнёру" required maxLength={1200} />
                <label className="grid gap-1 text-sm font-medium">
                  Срок ответа партнёра (необязательно)
                  <input type="date" name="responseDeadline" className="min-h-11 border border-zinc-300 px-3" />
                </label>
                <InternalNote />
                <ActionResult state={clarificationState} />
                <SubmitButton pending={clarificationPending} label="Запросить уточнение" />
              </form>
            </details>
          ) : null}

          <details className="border border-zinc-200 p-4">
            <summary className="cursor-pointer font-semibold text-red-800">Отклонить заявку</summary>
            <form action={rejectionAction} className="mt-4 grid gap-4">
              <RequestIdentity detail={detail} />
              <SelectField name="reasonCategory" label="Причина отказа" options={rejectionReasons} />
              <TextArea name="partnerMessage" label="Объяснение для партнёра" required maxLength={1200} />
              <InternalNote />
              <ActionResult state={rejectionState} />
              <SubmitButton pending={rejectionPending} label="Отклонить заявку" destructive />
            </form>
          </details>

          <details className="border border-zinc-200 p-4">
            <summary className="cursor-pointer font-semibold">Отменить заявку</summary>
            <form action={cancellationAction} className="mt-4 grid gap-4">
              <input type="hidden" name="requestId" value={detail.request.id} />
              <SelectField
                name="reasonCategory"
                label="Причина"
                options={[
                  ["cancelled_by_applicant", "По просьбе заявителя"],
                  ["duplicate_application", "Повторная заявка"],
                  ["other", "Другая причина"],
                ]}
              />
              <TextArea name="internalNote" label="Внутреннее обоснование" required maxLength={2000} />
              <ActionResult state={cancellationState} />
              <SubmitButton pending={cancellationPending} label="Отменить заявку" destructive />
            </form>
          </details>
        </div>
      ) : (
        <form action={reopenAction} className="grid gap-4 border border-zinc-200 p-4">
          <input type="hidden" name="requestId" value={detail.request.id} />
          <SelectField
            name="assigneeUserId"
            label="Ответственный менеджер"
            options={detail.managers.map((manager) => [manager.id, `${manager.name} · ${manager.workloadCount} активных`])}
          />
          <TextArea name="reason" label="Причина возобновления" required maxLength={500} />
          <ActionResult state={reopenState} />
          <SubmitButton pending={reopenPending} label="Возобновить проверку" />
        </form>
      )}
    </section>
  );
}

function RequestIdentity({ detail }: { detail: OnboardingDetail }) {
  return (
    <>
      <input type="hidden" name="requestId" value={detail.request.id} />
      <input type="hidden" name="requestRevision" value={detail.revision.revisionNumber} />
    </>
  );
}

function SelectField({ name, label, options }: { name: string; label: string; options: readonly (readonly [string, string])[] }) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <select name={name} required defaultValue="" className="min-h-11 border border-zinc-300 bg-white px-3">
        <option value="" disabled>Выберите</option>
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  );
}

function TextArea({ name, label, required, maxLength }: { name: string; label: string; required?: boolean; maxLength: number }) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <textarea name={name} required={required} minLength={required ? 3 : undefined} maxLength={maxLength} rows={4} className="border border-zinc-300 p-3" />
    </label>
  );
}

function InternalNote() {
  return (
    <div className="border-l-4 border-zinc-400 bg-zinc-50 p-3">
      <TextArea name="internalNote" label="Внутренняя заметка (партнёр её не увидит)" maxLength={2000} />
    </div>
  );
}

function ActionResult({ state }: { state: OnboardingWorkflowActionState }) {
  if (!state.message) return null;
  return <p role="status" className={state.success ? "text-sm text-emerald-700" : "text-sm text-red-700"}>{state.message}</p>;
}

function SubmitButton({ pending, label, destructive }: { pending: boolean; label: string; destructive?: boolean }) {
  return (
    <button disabled={pending} className={`min-h-11 px-4 text-sm font-semibold text-white disabled:opacity-60 ${destructive ? "bg-red-700" : "bg-emerald-700"}`}>
      {pending ? "Сохранение..." : label}
    </button>
  );
}

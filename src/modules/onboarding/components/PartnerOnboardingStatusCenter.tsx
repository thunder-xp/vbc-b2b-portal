"use client";

import { useActionState } from "react";
import Link from "next/link";

import {
  cancelOwnOnboardingRequestAction,
  type OnboardingWorkflowActionState,
} from "../actions";
import type { PartnerOnboardingStatusCenter as StatusCenter } from "../types";
import { ONBOARDING_STATUS_LABELS } from "./onboarding-labels";

const initialState: OnboardingWorkflowActionState = { success: true, errorCode: null, message: "", data: null };

export function PartnerOnboardingStatusCenter({ center }: { center: StatusCenter }) {
  const [state, action, pending] = useActionState(cancelOwnOnboardingRequestAction, initialState);
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="border-b border-zinc-200 pb-5">
          <p className="text-sm font-semibold uppercase text-emerald-700">Партнёрская заявка</p>
          <h1 className="mt-2 text-2xl font-semibold">{ONBOARDING_STATUS_LABELS[center.status]}</h1>
          <p className="mt-2 text-sm text-zinc-600">{nextAction(center.status)}</p>
        </header>

        <section className="grid gap-4 border-b border-zinc-200 bg-white pb-6 sm:grid-cols-2">
          <Value label="Компания" value={center.companyName} />
          <Value label="Редакция заявки" value={`${center.revisionNumber} · ${formatDate(center.revisionSubmittedAt)}`} />
        </section>

        {center.partnerMessage ? (
          <section className="border-l-4 border-amber-500 bg-amber-50 p-4" aria-labelledby="partner-message-title">
            <h2 id="partner-message-title" className="font-semibold">Сообщение Novotech</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">{center.partnerMessage}</p>
            {center.requestedFields.length ? (
              <div className="mt-4">
                <p className="text-sm font-semibold">Требуется уточнить:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {center.requestedFields.map((field) => <li key={field}>{fieldLabel(field)}</li>)}
                </ul>
              </div>
            ) : null}
            {center.responseDeadline ? <p className="mt-3 text-sm font-medium">Ответить до: {formatDateOnly(center.responseDeadline)}</p> : null}
          </section>
        ) : null}

        {center.canUpdate ? (
          <Link href="/onboarding/update" className="inline-flex min-h-11 items-center justify-center bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
            Дополнить заявку
          </Link>
        ) : null}
        {center.status === "approved" ? (
          <Link href="/cabinet" className="inline-flex min-h-11 items-center justify-center bg-emerald-700 px-5 text-sm font-semibold text-white">Открыть кабинет</Link>
        ) : null}
        {center.status === "cancelled" ? (
          <Link href="/onboarding/access-request" className="inline-flex min-h-11 items-center justify-center border border-zinc-300 px-5 text-sm font-semibold">Подать новую заявку</Link>
        ) : null}

        <section className="border-b border-zinc-200 bg-white pb-6">
          <h2 className="mb-4 text-lg font-semibold">История заявки</h2>
          <ol className="space-y-4">
            {center.timeline.map((item, index) => (
              <li key={`${item.occurredAt}-${index}`} className="grid grid-cols-[0.75rem_minmax(0,1fr)] gap-3 text-sm">
                <span className="mt-1.5 h-2 w-2 rounded-full bg-emerald-700" aria-hidden />
                <div><p className="font-medium">{timelineLabel(item.event)}</p><p className="text-zinc-500">{formatDate(item.occurredAt)}</p></div>
              </li>
            ))}
          </ol>
        </section>

        {center.canCancel ? (
          <details className="border border-zinc-200 bg-white p-4">
            <summary className="cursor-pointer font-semibold">Отменить заявку</summary>
            <form action={action} className="mt-4 grid gap-3">
              <p className="text-sm text-zinc-600">Заявка останется в истории, но Novotech прекратит её обработку.</p>
              <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="confirmed" required /> Я подтверждаю отмену заявки
              </label>
              {state.message ? <p role="status" className={state.success ? "text-sm text-emerald-700" : "text-sm text-red-700"}>{state.message}</p> : null}
              <button disabled={pending} className="min-h-11 justify-self-start border border-red-300 px-4 text-sm font-semibold text-red-700 disabled:opacity-60">{pending ? "Отмена..." : "Отменить заявку"}</button>
            </form>
          </details>
        ) : null}
      </div>
    </main>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return <div><p className="text-sm text-zinc-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}

function nextAction(status: StatusCenter["status"]): string {
  return {
    received: "Заявка получена и ожидает назначения менеджера.",
    under_review: "Novotech проверяет данные компании.",
    clarification_requested: "Дополните указанные данные и отправьте новую редакцию.",
    awaiting_1c_company: "Ожидается подтверждение компании в 1С.",
    link_confirmation_required: "Novotech подтверждает связь с компанией.",
    ready_for_approval: "Проверка завершена, доступ готовится к открытию.",
    approved: "Доступ открыт. Можно перейти в кабинет.",
    rejected: "Решение и дальнейшие действия указаны в сообщении Novotech.",
    cancelled: "Обработка заявки остановлена.",
  }[status];
}

function fieldLabel(field: string): string {
  return {
    company_name: "Название компании", fiscal_code: "Фискальный код",
    contact_name: "Контактное лицо", phone: "Телефон", email: "Электронная почта",
    locality: "Населённый пункт", business_type: "Тип бизнеса",
    business_activity: "Направление деятельности",
    estimated_purchasing_volume: "Ожидаемый объём закупок", comment: "Комментарий",
  }[field] ?? "Данные заявки";
}

function timelineLabel(event: string): string {
  return {
    revision_created: "Заявка отправлена", review_started: "Проверка начата",
    clarification_requested: "Запрошено уточнение",
    partner_revision_submitted: "Обновлённая заявка отправлена",
    ready_for_approval: "Заявка готова к подключению",
    onboarding_approved: "Доступ открыт", rejected: "Заявка отклонена",
    cancelled: "Заявка отменена", reopened: "Проверка возобновлена",
  }[event] ?? "Статус заявки обновлён";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Chisinau", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDateOnly(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Chisinau", dateStyle: "long" }).format(new Date(`${value}T12:00:00+03:00`));
}

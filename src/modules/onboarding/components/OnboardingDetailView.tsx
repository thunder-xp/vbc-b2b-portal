import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CircleCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";

import type { OnboardingDetail, OnboardingStatus } from "../types";
import {
  INITIAL_ACCESS_LABELS,
  ONBOARDING_STATUS_LABELS,
} from "./onboarding-labels";

type Props = {
  detail: OnboardingDetail;
  assignAction: (formData: FormData) => Promise<void>;
  unassignAction: (formData: FormData) => Promise<void>;
  transitionAction: (formData: FormData) => Promise<void>;
  confirmAction: (formData: FormData) => Promise<void>;
};

export function OnboardingDetailView({
  detail,
  assignAction,
  unassignAction,
  transitionAction,
  confirmAction,
}: Props) {
  const duplicateWarnings = duplicateMessages(detail);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/admin/onboarding" className="text-sm font-medium text-emerald-700">
            ← К очереди
          </Link>
          <h1 className="mt-3 text-2xl font-semibold">{detail.revision.companyName}</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Редакция {detail.revision.revisionNumber} · подана{" "}
            {formatDate(detail.revision.submittedAt)}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="font-semibold text-zinc-900">
            {ONBOARDING_STATUS_LABELS[detail.request.status]}
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            {detail.request.assignedManager || "Ответственный не назначен"}
          </p>
        </div>
      </div>

      <section className="grid gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 md:grid-cols-3">
        <InfoMetric
          icon={UserRound}
          label="Ответственный"
          value={detail.request.assignedManager || "Не назначен"}
        />
        <InfoMetric
          icon={CalendarClock}
          label="Первая проверка"
          value={detail.request.reviewStartedAt ? "Начата" : `до ${formatDate(detail.sla.firstReviewDue)}`}
        />
        <InfoMetric
          icon={CircleCheck}
          label="Финальное решение"
          value={detail.sla.paused ? "SLA приостановлен" : `до ${formatDate(detail.sla.finalDecisionDue)}`}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <div className="space-y-6">
          <Section title="Данные заявки">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Definition label="Компания" value={detail.revision.companyName} />
              <Definition label="IDNO / фискальный код" value={detail.revision.fiscalCode} />
              <Definition label="Контакт" value={detail.revision.contactName} />
              <Definition label="Телефон" value={detail.revision.phone} />
              <Definition label="Электронная почта" value={detail.revision.email} />
              <Definition label="Комментарий" value={detail.revision.message} />
            </dl>
          </Section>

          <Section title="Совпадения в локальном справочнике 1С">
            {detail.candidates.length === 0 ? (
              <div className="py-4">
                <p className="font-medium">Авторитетный контрагент не найден</p>
                <p className="mt-1 text-sm text-zinc-600">
                  Финальное подключение заблокировано до следующей синхронизации 1С.
                </p>
                <TransitionForm
                  requestId={detail.request.id}
                  nextStatus="awaiting_1c_company"
                  label="Ожидает создания контрагента в 1С"
                  action={transitionAction}
                />
              </div>
            ) : (
              <div className="divide-y divide-zinc-200">
                {detail.candidates.map((candidate) => (
                  <article key={candidate.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-semibold">{candidate.companyName}</h3>
                        <p className="mt-1 text-sm text-zinc-600">
                          {candidate.fiscalCode || "IDNO не указан"} ·{" "}
                          {candidate.locality || "Населённый пункт не указан"}
                        </p>
                        <p className="mt-1 text-sm text-zinc-500">
                          Договоров: {candidate.contractCount} · ценовых профилей:{" "}
                          {candidate.priceProfileCount}
                        </p>
                        {!candidate.active && (
                          <p className="mt-2 text-sm font-medium text-red-700">
                            Контрагент неактивен
                          </p>
                        )}
                        {candidate.portalLinkageState === "already_linked" && (
                          <p className="mt-2 text-sm font-medium text-amber-800">
                            Уже связан с компанией портала
                          </p>
                        )}
                      </div>
                      {candidate.active &&
                        candidate.portalLinkageState !== "already_linked" && (
                          <form action={confirmAction} className="space-y-2 sm:w-52">
                            <input type="hidden" name="requestId" value={detail.request.id} />
                            <input type="hidden" name="counterpartyId" value={candidate.id} />
                            <label className="block text-sm font-medium">
                              Начальный профиль
                              <select
                                name="initialAccessProfile"
                                defaultValue="owner"
                                className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3"
                              >
                                {Object.entries(INITIAL_ACCESS_LABELS).map(([value, label]) => (
                                  <option value={value} key={value}>{label}</option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="submit"
                              className="min-h-11 w-full rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800"
                            >
                              Подтвердить связь
                            </button>
                          </form>
                        )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Section>

          <Section title="История">
            <ol className="space-y-3">
              {detail.events.map((event, index) => (
                <li key={`${event.occurredAt}-${index}`} className="flex gap-3 text-sm">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-600" />
                  <div>
                    <p className="font-medium text-zinc-800">{eventLabel(event.event)}</p>
                    <p className="text-zinc-500">
                      {formatDate(event.occurredAt)}
                      {event.actor ? ` · ${event.actor}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <aside className="space-y-6">
          {duplicateWarnings.length > 0 && (
            <section className="border-l-4 border-amber-500 bg-amber-50 p-4">
              <h2 className="flex items-center gap-2 font-semibold text-amber-950">
                <AlertTriangle className="h-5 w-5" aria-hidden />
                Проверка дубликатов
              </h2>
              <ul className="mt-3 space-y-2 text-sm text-amber-900">
                {duplicateWarnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </section>
          )}

          <Section title="Работа с заявкой">
            <div className="space-y-3">
              <form action={assignAction} className="space-y-2">
                <input type="hidden" name="requestId" value={detail.request.id} />
                <label className="block text-sm font-medium">
                  Ответственный менеджер
                  <select
                    name="assigneeUserId"
                    defaultValue=""
                    required
                    className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3"
                  >
                    <option value="" disabled>Выберите менеджера</option>
                    {detail.managers.map((manager) => (
                      <option key={manager.id} value={manager.id}>{manager.name}</option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="min-h-11 w-full rounded-md border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-50">
                  Назначить
                </button>
              </form>
              <form action={assignAction}>
                <input type="hidden" name="requestId" value={detail.request.id} />
                <input type="hidden" name="assigneeUserId" value="self" />
                <button type="submit" className="min-h-11 w-full rounded-md border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-50">
                  Назначить на себя
                </button>
              </form>
              {detail.request.assignedManager && (
                <form action={unassignAction}>
                  <input type="hidden" name="requestId" value={detail.request.id} />
                  <button type="submit" className="min-h-11 w-full rounded-md border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-50">
                    Снять назначение
                  </button>
                </form>
              )}
              {detail.request.status === "received" && (
                <TransitionForm
                  requestId={detail.request.id}
                  nextStatus="under_review"
                  label="Начать проверку"
                  action={transitionAction}
                  primary
                />
              )}
              {detail.request.status === "link_confirmation_required" && (
                <TransitionForm
                  requestId={detail.request.id}
                  nextStatus="ready_for_approval"
                  label="Готово к подключению"
                  action={transitionAction}
                  primary
                />
              )}
              <p className="text-sm text-zinc-600">
                Одобрение доступа выполняется в следующем срезе. Технические идентификаторы не требуются.
              </p>
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-zinc-200 bg-white pb-6">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function InfoMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-24 gap-3 bg-white p-4">
      <Icon className="mt-0.5 h-5 w-5 text-emerald-700" aria-hidden />
      <div>
        <p className="text-sm text-zinc-500">{label}</p>
        <p className="mt-1 font-semibold">{value}</p>
      </div>
    </div>
  );
}

function Definition({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-zinc-900">
        {value || "Не указано"}
      </dd>
    </div>
  );
}

function TransitionForm({
  requestId,
  nextStatus,
  label,
  action,
  primary = false,
}: {
  requestId: string;
  nextStatus: OnboardingStatus;
  label: string;
  action: (formData: FormData) => Promise<void>;
  primary?: boolean;
}) {
  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="nextStatus" value={nextStatus} />
      <button
        type="submit"
        className={
          primary
            ? "min-h-11 w-full rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
            : "min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-50"
        }
      >
        {label}
      </button>
    </form>
  );
}

function duplicateMessages(detail: OnboardingDetail): string[] {
  const messages: string[] = [];
  if (detail.duplicates.sameFiscalCode) messages.push("Есть другая активная заявка с тем же IDNO.");
  if (detail.duplicates.sameEmail) messages.push("Электронная почта используется другим профилем.");
  if (detail.duplicates.existingMembership) messages.push("У пользователя уже есть активное членство.");
  if (detail.duplicates.userLinkedToAnotherCompany) messages.push("Пользователь связан с другой компанией. Требуется администратор.");
  return messages;
}

function eventLabel(event: string): string {
  return {
    application_migrated: "Заявка перенесена в новый процесс",
    revision_created: "Создана новая редакция",
    assigned: "Назначен ответственный",
    unassigned: "Ответственный снят",
    review_started: "Проверка начата",
    match_suggested: "Найден кандидат 1С",
    match_confirmed: "Контрагент 1С подтверждён",
    awaiting_1c_company: "Ожидается создание контрагента в 1С",
    ready_for_approval: "Заявка готова к подключению",
    status_changed: "Статус изменён",
    approval_failed: "Попытка подключения не завершена",
    capability_granted: "Полномочие выдано",
    capability_revoked: "Полномочие отозвано",
  }[event] ?? event;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Chisinau",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

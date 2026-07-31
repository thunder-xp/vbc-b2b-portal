import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CircleCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";

import type { OnboardingDetail, OnboardingStatus } from "../types";
import { ONBOARDING_STATUS_LABELS } from "./onboarding-labels";
import { OnboardingApprovalWizard } from "./OnboardingApprovalWizard";
import { OnboardingDecisionForms } from "./OnboardingDecisionForms";
import { OnboardingLinkPendingIndicator } from "./OnboardingLinkPendingIndicator";

type Props = {
  detail: OnboardingDetail;
  assignAction: (formData: FormData) => Promise<void>;
  unassignAction: (formData: FormData) => Promise<void>;
  transitionAction: (formData: FormData) => Promise<void>;
};

export function OnboardingDetailView({
  detail,
  assignAction,
  unassignAction,
  transitionAction,
}: Props) {
  const duplicateWarnings = duplicateMessages(detail);
  const terminal = (["approved", "rejected", "cancelled"] as OnboardingStatus[]).includes(
    detail.request.status,
  );
  const canRenderDecisionForms =
    !terminal ||
    ((["rejected", "cancelled"] as OnboardingStatus[]).includes(detail.request.status) &&
      detail.workflow.isPlatformAdmin);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/admin/onboarding" prefetch={false} className="inline-flex items-center text-sm font-medium text-emerald-700">
            ← К очереди
            <OnboardingLinkPendingIndicator />
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
              <Definition label="Населённый пункт" value={detail.revision.locality} />
              <Definition label="Тип бизнеса" value={detail.revision.businessType} />
              <Definition label="Направление деятельности" value={detail.revision.businessActivity} />
              <Definition label="Ожидаемый объём закупок" value={detail.revision.estimatedPurchasingVolume} />
              <Definition label="Комментарий" value={detail.revision.message} />
            </dl>
          </Section>

          {detail.workflow.clarification ? (
            <Section title="Уточнение данных">
              <p className="text-sm font-semibold">Сообщение партнёру</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{detail.workflow.clarification.partnerMessage}</p>
              {detail.workflow.clarification.internalNote ? (
                <div className="mt-4 border-l-4 border-zinc-400 bg-zinc-50 p-3">
                  <p className="text-xs font-semibold uppercase text-zinc-600">Только для сотрудников Novotech</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{detail.workflow.clarification.internalNote}</p>
                </div>
              ) : null}
            </Section>
          ) : null}

          {terminal ? (
            <TerminalResult status={detail.request.status} />
          ) : (
            <OnboardingApprovalWizard
              detail={{
                request: { id: detail.request.id, status: detail.request.status },
                draft: detail.draft,
                candidates: detail.candidates,
                managers: detail.managers,
                duplicates: detail.duplicates,
                directoryFiscalMatchCount: detail.directoryFiscalMatchCount,
              }}
            />
          )}

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

          {canRenderDecisionForms ? (
            <OnboardingDecisionForms
              requestId={detail.request.id}
              requestStatus={detail.request.status}
              requestRevision={detail.revision.revisionNumber}
              managers={detail.managers}
              isPlatformAdmin={detail.workflow.isPlatformAdmin}
            />
          ) : null}

          {!terminal ? (
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
                      <option key={manager.id} value={manager.id}>{manager.name} · {manager.workloadCount} активных</option>
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
                Подключение выполняется в мастере слева. Технические идентификаторы не требуются.
              </p>
            </div>
          </Section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function TerminalResult({ status }: { status: OnboardingStatus }) {
  return (
    <section className="border-b border-zinc-200 pb-6">
      <h2 className="text-lg font-semibold">Результат подключения</h2>
      <p className="mt-2 text-sm text-zinc-600">
        {status === "approved"
          ? "Доступ открыт. Компания и пользователь подключены."
          : "Заявка завершена. Подключение недоступно."}
      </p>
    </section>
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
    reassigned: "Ответственный изменён",
    unassigned: "Ответственный снят",
    review_started: "Проверка начата",
    match_suggested: "Найден кандидат 1С",
    match_confirmed: "Контрагент 1С подтверждён",
    awaiting_1c_company: "Ожидается создание контрагента в 1С",
    ready_for_approval: "Заявка готова к подключению",
    status_changed: "Статус изменён",
    approval_failed: "Попытка подключения не завершена",
    approval_draft_updated: "Черновик подключения обновлён",
    onboarding_approved: "Доступ к кабинету открыт",
    capability_granted: "Полномочие выдано",
    capability_revoked: "Полномочие отозвано",
    clarification_requested: "Запрошено уточнение данных",
    partner_revision_submitted: "Партнёр отправил новую редакцию",
    rejected: "Заявка отклонена",
    cancelled: "Заявка отменена",
    reopened: "Проверка возобновлена",
    sla_paused: "SLA решения приостановлен",
    sla_resumed: "SLA решения возобновлён",
  }[event] ?? event;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Chisinau",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

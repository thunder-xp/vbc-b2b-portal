import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  Search,
  UserRound,
} from "lucide-react";
import Link from "next/link";

import type { OnboardingQueue, OnboardingQueueInput } from "../index";
import {
  MATCH_LABELS,
  ONBOARDING_STATUS_LABELS,
  SLA_LABELS,
} from "./onboarding-labels";

type Props = {
  queue: OnboardingQueue;
  filters: OnboardingQueueInput;
  canSynchronize: boolean;
  syncAction: () => Promise<void>;
  assignAction: (formData: FormData) => Promise<void>;
};

export function OnboardingQueueView({
  queue,
  filters,
  canSynchronize,
  syncAction,
  assignAction,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(queue.totalCount / queue.pageSize));

  return (
    <div className="space-y-5">
      <section className="grid gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Новые сегодня" value={queue.slaCounters.newToday} icon={Building2} />
        <Metric label="Без ответственного" value={queue.slaCounters.unassigned} icon={UserRound} />
        <Metric
          label="Просрочены"
          value={
            queue.slaCounters.waitingOverFourHours +
            queue.slaCounters.waitingOverOneDay
          }
          icon={Clock3}
        />
        <Metric
          label="Готовы к подключению"
          value={queue.slaCounters.readyForApproval}
          icon={CheckCircle2}
        />
      </section>

      <section className="flex flex-col gap-3 border-y border-zinc-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-900">
            {freshnessText(queue.directoryFreshness)}
          </p>
          {queue.directoryFreshness?.stale && (
            <p className="mt-1 text-sm text-amber-800">
              Используются последние подтверждённые данные 1С.
            </p>
          )}
        </div>
        {canSynchronize && (
          <form action={syncAction}>
            <button
              type="submit"
              className="min-h-11 rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              Обновить справочник
            </button>
          </form>
        )}
      </section>

      <form
        method="get"
        className="grid gap-3 border-b border-zinc-200 bg-white pb-5 md:grid-cols-2 xl:grid-cols-5"
      >
        <label className="relative">
          <span className="sr-only">Поиск заявок</span>
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-zinc-400" />
          <input
            name="q"
            defaultValue={filters.search ?? ""}
            placeholder="Компания, IDNO, контакт, телефон"
            className="min-h-11 w-full rounded-md border border-zinc-300 bg-white pl-9 pr-3 text-sm"
          />
        </label>
        <FilterSelect
          name="status"
          label="Статус"
          value={filters.status}
          options={Object.entries(ONBOARDING_STATUS_LABELS)}
        />
        <FilterSelect
          name="manager"
          label="Ответственный"
          value={filters.assignedManager}
          options={queue.managers.map((manager) => [manager.id, manager.name])}
        />
        <label className="flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm">
          <input
            type="checkbox"
            name="unassigned"
            value="1"
            defaultChecked={filters.unassigned}
          />
          Без ответственного
        </label>
        <label>
          <span className="sr-only">Населённый пункт</span>
          <input
            name="locality"
            defaultValue={filters.locality ?? ""}
            placeholder="Населённый пункт"
            className="min-h-11 w-full rounded-md border border-zinc-300 px-3 text-sm"
          />
        </label>
        <label>
          <span className="sr-only">Тип бизнеса</span>
          <input
            name="businessType"
            defaultValue={filters.businessType ?? ""}
            placeholder="Тип бизнеса"
            className="min-h-11 w-full rounded-md border border-zinc-300 px-3 text-sm"
          />
        </label>
        <label className="text-xs text-zinc-500">
          Подано с
          <input
            type="date"
            name="from"
            defaultValue={filters.submittedFrom ?? ""}
            className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-3 text-sm text-zinc-900"
          />
        </label>
        <label className="text-xs text-zinc-500">
          Подано до
          <input
            type="date"
            name="to"
            defaultValue={filters.submittedTo ?? ""}
            className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-3 text-sm text-zinc-900"
          />
        </label>
        <FilterSelect
          name="match"
          label="Совпадение"
          value={filters.matchState}
          options={Object.entries(MATCH_LABELS)}
        />
        <FilterSelect
          name="sla"
          label="SLA"
          value={filters.sla}
          options={Object.entries(SLA_LABELS)}
        />
        <button
          type="submit"
          className="min-h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          Применить
        </button>
      </form>

      {queue.rows.length === 0 ? (
        <section className="border-b border-zinc-200 py-12 text-center">
          <h2 className="text-base font-semibold">Заявки не найдены</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Измените фильтры или поисковый запрос.
          </p>
        </section>
      ) : (
        <div className="overflow-hidden border-y border-zinc-200 bg-white">
          <div className="hidden grid-cols-[minmax(220px,1.4fr)_160px_150px_150px_170px] gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold uppercase text-zinc-500 lg:grid">
            <span>Компания и контакт</span>
            <span>Ответственный</span>
            <span>Статус</span>
            <span>SLA и совпадение</span>
            <span>Следующий шаг</span>
          </div>
          {queue.rows.map((row) => (
            <article
              key={row.id}
              className="grid gap-4 border-b border-zinc-100 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(220px,1.4fr)_160px_150px_150px_170px] lg:items-center"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/onboarding/${row.id}`}
                  prefetch={false}
                  className="font-semibold text-zinc-950 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-600"
                >
                  {row.company_name}
                </Link>
                <p className="mt-1 text-sm text-zinc-600">
                  {row.fiscal_code || "IDNO не указан"} · {row.contact_name || "Контакт не указан"}
                </p>
                <p className="truncate text-sm text-zinc-500">
                  {[row.phone, row.email].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Редакций: {row.revision_count} · Последнее действие: {formatRelativeAge(row.clarification_age_seconds ?? row.assignment_age_seconds)}
                </p>
                {row.duplicate_fiscal_code && (
                  <p className="mt-2 flex items-center gap-1 text-sm font-medium text-amber-800">
                    <AlertTriangle className="h-4 w-4" aria-hidden />
                    Возможный дубликат
                  </p>
                )}
              </div>
              <p className="text-sm text-zinc-700">
                {row.assigned_manager || "Не назначен"}
              </p>
              <StatusText status={row.onboarding_status} />
              <div className="text-sm">
                <p className={row.sla_state.startsWith("overdue") ? "font-medium text-red-700" : "text-zinc-700"}>
                  {SLA_LABELS[row.sla_state] ?? row.sla_state}
                </p>
                <p className="mt-1 text-zinc-500">
                  {MATCH_LABELS[row.match_state] ?? row.match_state}
                </p>
                {row.sla_paused ? <p className="mt-1 font-medium text-amber-800">SLA приостановлен</p> : null}
                {row.partner_response_overdue ? <p className="mt-1 font-medium text-red-700">Ответ партнёра просрочен</p> : null}
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-800">{row.next_action}</p>
                <Link
                  href={`/admin/onboarding/${row.id}`}
                  prefetch={false}
                  className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  Открыть заявку
                </Link>
                {!row.assigned_manager_user_id && !["approved", "rejected", "cancelled"].includes(row.onboarding_status) ? (
                  <form action={assignAction} className="mt-1">
                    <input type="hidden" name="requestId" value={row.id} />
                    <input type="hidden" name="assigneeUserId" value="self" />
                    <button className="min-h-11 text-sm font-semibold text-zinc-700">Назначить на себя</button>
                  </form>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      <nav className="flex items-center justify-between" aria-label="Страницы очереди">
        <PaginationLink
          disabled={queue.page <= 1}
          href={queueHref(filters, queue.page - 1)}
        >
          Назад
        </PaginationLink>
        <p className="text-sm text-zinc-600">
          Страница {queue.page} из {totalPages} · {queue.totalCount} заявок
        </p>
        <PaginationLink
          disabled={queue.page >= totalPages}
          href={queueHref(filters, queue.page + 1)}
        >
          Далее
        </PaginationLink>
      </nav>
    </div>
  );
}

function formatRelativeAge(seconds: number | null): string {
  if (seconds === null) return "только что";
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))} мин.`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч.`;
  return `${Math.floor(seconds / 86400)} дн.`;
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Building2;
}) {
  return (
    <div className="flex min-h-24 items-center gap-3 bg-white px-4 py-4">
      <Icon className="h-5 w-5 text-emerald-700" aria-hidden />
      <div>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-sm text-zinc-600">{label}</p>
      </div>
    </div>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string | null;
  options: Array<[string, string]>;
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ""}
        className="min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
      >
        <option value="">{label}: все</option>
        {options.map(([optionValue, optionLabel]) => (
          <option value={optionValue} key={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusText({ status }: { status: keyof typeof ONBOARDING_STATUS_LABELS }) {
  return (
    <p className="text-sm font-semibold text-zinc-800">
      {ONBOARDING_STATUS_LABELS[status]}
    </p>
  );
}

function PaginationLink({
  disabled,
  href,
  children,
}: {
  disabled: boolean;
  href: string;
  children: string;
}) {
  return disabled ? (
    <span className="min-h-11 px-3 py-3 text-sm text-zinc-400">{children}</span>
  ) : (
    <Link
      href={href}
      prefetch={false}
      className="min-h-11 px-3 py-3 text-sm font-medium text-emerald-700 hover:text-emerald-800"
    >
      {children}
    </Link>
  );
}

function queueHref(filters: OnboardingQueueInput, page: number): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (filters.search) params.set("q", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.sla) params.set("sla", filters.sla);
  if (filters.matchState) params.set("match", filters.matchState);
  if (filters.assignedManager) params.set("manager", filters.assignedManager);
  if (filters.unassigned) params.set("unassigned", "1");
  if (filters.locality) params.set("locality", filters.locality);
  if (filters.businessType) params.set("businessType", filters.businessType);
  if (filters.submittedFrom) params.set("from", filters.submittedFrom);
  if (filters.submittedTo) params.set("to", filters.submittedTo);
  return `/admin/onboarding?${params.toString()}`;
}

function freshnessText(
  freshness: OnboardingQueue["directoryFreshness"],
): string {
  if (!freshness?.synchronizedAt) return "Справочник контрагентов ещё не синхронизирован";
  const value = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Chisinau",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(freshness.synchronizedAt));
  return `Данные контрагентов обновлены ${value}`;
}

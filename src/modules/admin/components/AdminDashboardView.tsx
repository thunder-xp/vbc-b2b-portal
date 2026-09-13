import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  Database,
  RefreshCw,
  Users,
} from "lucide-react";
import Link from "next/link";

import type {
  AdminDashboard,
  AdminHealthStatus,
} from "../types";

const STATUS = {
  HEALTHY: { label: "Актуально", className: "text-emerald-700", icon: CheckCircle2 },
  RUNNING: { label: "Выполняется", className: "text-sky-700", icon: RefreshCw },
  DEGRADED: { label: "Ограничено", className: "text-amber-700", icon: AlertTriangle },
  FAILED: { label: "Ошибка", className: "text-red-700", icon: AlertTriangle },
  STALE: { label: "Устарело", className: "text-amber-700", icon: Clock3 },
  NEVER_SYNCED: { label: "Ещё не синхронизировано", className: "text-zinc-600", icon: Database },
  SUCCESS_EMPTY: { label: "Нет данных в 1С", className: "text-emerald-700", icon: CheckCircle2 },
} satisfies Record<
  AdminHealthStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
>;

export function AdminDashboardView({ dashboard }: { dashboard: AdminDashboard }) {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase text-emerald-700">
          Операционный обзор
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Рабочий стол</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Локальное состояние платформы, очереди и свежесть коммерческих данных.
        </p>
      </header>

      {dashboard.criticalCount > 0 ? (
        <section className="flex items-start gap-3 border border-red-200 bg-red-50 p-4 text-red-900">
          <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Требуется внимание: {dashboard.criticalCount}</p>
            <p className="mt-1 text-sm">
              Проверьте ошибки синхронизации и неподтверждённые результаты операций.
            </p>
            <Link
              className="mt-3 inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:underline"
              href="/admin/operations/issues"
              prefetch={false}
            >
              Посмотреть проблемы →
            </Link>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-base font-semibold">Коммерческие данные</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {dashboard.freshness.map((item) => {
            const status = STATUS[item.status];
            const Icon = status.icon;
            return (
              <Link
                aria-label={`${item.label}: ${status.label}. Открыть подробности`}
                className="group block border border-zinc-200 bg-white p-4 transition-colors hover:border-emerald-500 hover:bg-emerald-50/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                href={item.href}
                key={item.key}
                prefetch={false}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{item.label}</p>
                  <Icon aria-hidden className={`h-5 w-5 ${status.className}`} />
                </div>
                <p className={`mt-3 text-sm font-medium ${status.className}`}>
                  {status.label}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {(item.status === "FAILED" ? item.lastAttemptAt : item.lastSuccessAt)
                    ? new Intl.DateTimeFormat("ru-RU", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date((item.status === "FAILED" ? item.lastAttemptAt : item.lastSuccessAt)!))
                    : "Синхронизация не зафиксирована"}
                </p>
                <span className="mt-3 inline-flex text-sm font-semibold text-emerald-700 group-hover:text-emerald-800">
                  {item.status === "HEALTHY" || item.status === "SUCCESS_EMPTY" || item.status === "RUNNING"
                    ? "Открыть историю →"
                    : "Подробнее →"}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <SummaryCard
          icon={Building2}
          items={[
            ["Активные компании", dashboard.partnerAccess.activeCompanies],
            ["Активные пользователи", dashboard.partnerAccess.activePartnerUsers],
            ["Ожидают приглашения", dashboard.partnerAccess.pendingInvitations],
            ["Приостановлены", dashboard.partnerAccess.suspendedMemberships],
            ["Без владельца", dashboard.partnerAccess.companiesWithoutOwner],
            ["Без связи с 1С", dashboard.partnerAccess.companiesMissingMapping],
          ]}
          link="/admin/companies"
          title="Доступ партнёров"
        />
        <SummaryCard
          icon={Users}
          items={[
            ["Заявки на доступ", dashboard.queues.pendingAccessRequests],
            ["Переносы дат", dashboard.queues.pendingDateChanges],
            ["Спецификации", dashboard.queues.specificationsAwaitingReview],
            ["Ошибки заказов", dashboard.queues.failedOrderExports],
          ]}
          link="/admin/date-change-requests"
          title="Операционная очередь"
        />
        <SummaryCard
          icon={Database}
          items={[
            ["Компании", dashboard.finance.eligibleCompanies],
            ["Актуальные снимки", dashboard.finance.successfulSnapshots],
            ["Устаревшие", dashboard.finance.staleSnapshots],
            ["Ошибки", dashboard.finance.failedSyncs],
            ["Нет сопоставления", dashboard.finance.missingMappings],
          ]}
          title="Финансы"
        />
      </section>

      <section className="border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="font-semibold">Последние события</h2>
          <p className="mt-1 text-xs text-zinc-500">Не более 20 безопасных событий.</p>
        </div>
        {dashboard.recentEvents.length ? (
          <ul className="divide-y divide-zinc-100">
            {dashboard.recentEvents.map((event, index) => (
              <li className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm" key={`${event.domain}-${event.occurredAt}-${index}`}>
                <span>
                  <span className="font-medium">{event.eventType}</span>
                  {event.subject ? ` · ${event.subject}` : ""}
                </span>
                <time className="text-zinc-500" dateTime={event.occurredAt}>
                  {new Intl.DateTimeFormat("ru-RU", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(event.occurredAt))}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">
            Событий пока нет.
          </p>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  items,
  link,
  title,
}: {
  icon: typeof Building2;
  items: ReadonlyArray<readonly [string, number]>;
  link?: string;
  title: string;
}) {
  return (
    <article className="border border-zinc-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <Icon aria-hidden className="h-5 w-5 text-emerald-700" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      <dl className="mt-4 space-y-2">
        {items.map(([label, value]) => (
          <div className="flex items-center justify-between gap-4 text-sm" key={label}>
            <dt className="text-zinc-600">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {link ? (
        <Link className="mt-4 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-800" href={link} prefetch={false}>
          Открыть
        </Link>
      ) : null}
    </article>
  );
}

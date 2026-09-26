import { AlertTriangle, CheckCircle2, Clock3, Database, RefreshCw } from "lucide-react";
import Link from "next/link";

import type { AdminDashboard, AdminHealthStatus } from "../types";

const STATUS = {
  HEALTHY: { label: "Актуально", className: "text-emerald-700", icon: CheckCircle2 },
  RUNNING: { label: "Выполняется", className: "text-sky-700", icon: RefreshCw },
  DEGRADED: { label: "Ограничено", className: "text-amber-700", icon: AlertTriangle },
  FAILED: { label: "Ошибка", className: "text-red-700", icon: AlertTriangle },
  STALE: { label: "Устарело", className: "text-amber-700", icon: Clock3 },
  NEVER_SYNCED: { label: "Ещё не синхронизировано", className: "text-zinc-600", icon: Database },
  SUCCESS_EMPTY: { label: "Нет данных в 1С", className: "text-emerald-700", icon: CheckCircle2 },
} satisfies Record<AdminHealthStatus, { label: string; className: string; icon: typeof CheckCircle2 }>;

export function AdminDashboardView({ dashboard }: { dashboard: AdminDashboard }) {
  return (
    <div className="space-y-6">
      <section aria-labelledby="admin-operational-summary-title">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Сводка</p>
          <h2 className="mt-1 text-xl font-semibold" id="admin-operational-summary-title">
            Операционная картина
          </h2>
          <p className="mt-1 text-sm text-zinc-600">Ключевые показатели ежедневной работы.</p>
        </div>

        <div className="mt-4 grid gap-px overflow-hidden border border-zinc-200 bg-zinc-200 md:grid-cols-3">
          <SummaryBlock
            items={[
              ["Активные компании", dashboard.partnerAccess.activeCompanies],
              ["Активные пользователи", dashboard.partnerAccess.activePartnerUsers],
              ["Ожидают приглашения", dashboard.partnerAccess.pendingInvitations],
              ["Без владельца", dashboard.partnerAccess.companiesWithoutOwner],
            ]}
            link="/admin/companies"
            title="Доступ партнёров"
          />
          <SummaryBlock
            items={[
              ["Заявки на доступ", dashboard.queues.pendingAccessRequests],
              ["Переносы дат", dashboard.queues.pendingDateChanges],
              ["Спецификации", dashboard.queues.specificationsAwaitingReview],
              ["Ошибки заказов", dashboard.queues.failedOrderExports],
            ]}
            link="/admin/date-change-requests"
            title="Операционные очереди"
          />
          <SummaryBlock
            items={[
              ["Компании", dashboard.finance.eligibleCompanies],
              ["Актуальные снимки", dashboard.finance.successfulSnapshots],
              ["Устаревшие", dashboard.finance.staleSnapshots],
              ["Ошибки", dashboard.finance.failedSyncs],
            ]}
            title="Финансы"
          />
        </div>
      </section>

      <section aria-labelledby="admin-commercial-data-title">
        <h2 className="text-xl font-semibold" id="admin-commercial-data-title">
          Коммерческие данные
        </h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {dashboard.freshness.map((item) => {
            const status = STATUS[item.status];
            const Icon = status.icon;
            return (
              <Link
                aria-label={`${item.label}: ${status.label}. Открыть подробности`}
                className="group border border-zinc-200 bg-white p-3 hover:border-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                href={item.href}
                key={item.key}
                prefetch={false}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{item.label}</p>
                  <Icon aria-hidden className={`h-4 w-4 ${status.className}`} />
                </div>
                <p className={`mt-2 text-xs font-medium ${status.className}`}>{status.label}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {formatDate(item.status === "FAILED" ? item.lastAttemptAt : item.lastSuccessAt)}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <details className="border border-zinc-200 bg-white">
        <summary className="cursor-pointer px-4 py-4 font-semibold marker:text-zinc-400 sm:px-5">
          Последние события
        </summary>
        <div className="border-t border-zinc-200">
          <p className="px-4 py-3 text-xs text-zinc-500 sm:px-5">
            Не более 20 безопасных событий.
          </p>
          {dashboard.recentEvents.length ? (
            <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
              {dashboard.recentEvents.map((event, index) => (
                <li
                  className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm sm:px-5"
                  key={`${event.domain}-${event.occurredAt}-${index}`}
                >
                  <span>
                    <span className="font-medium">{event.eventType}</span>
                    {event.subject ? ` · ${event.subject}` : ""}
                  </span>
                  <time className="text-zinc-500" dateTime={event.occurredAt}>
                    {formatDate(event.occurredAt)}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t border-zinc-100 px-5 py-8 text-center text-sm text-zinc-500">
              Событий пока нет.
            </p>
          )}
        </div>
      </details>
    </div>
  );
}

function SummaryBlock({ items, link, title }: {
  items: ReadonlyArray<readonly [string, number]>;
  link?: string;
  title: string;
}) {
  return (
    <article className="bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        {link ? (
          <Link className="text-sm font-semibold text-emerald-700 hover:text-emerald-800" href={link} prefetch={false}>
            Открыть
          </Link>
        ) : null}
      </div>
      <dl className="mt-4 space-y-2">
        {items.map(([label, value]) => (
          <div className="flex items-center justify-between gap-4 text-sm" key={label}>
            <dt className="text-zinc-600">{label}</dt>
            <dd className="font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function formatDate(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
    : "Синхронизация не зафиксирована";
}

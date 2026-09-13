import Link from "next/link";

import type { AdminOperationalIssue } from "../types";
import { AdminIssueActions } from "./AdminIssueActions";

const DOMAIN_LABELS: Record<string, string> = {
  catalog: "Каталог",
  prices: "Цены",
  stock: "Остатки",
  arrivals: "Поступления",
  rates: "Курсы",
  finance: "Финансы",
  orders: "Заказы",
};

const STATUS_LABELS: Record<AdminOperationalIssue["healthStatus"], string> = {
  HEALTHY: "Актуально",
  RUNNING: "Выполняется",
  DEGRADED: "Ограничено",
  FAILED: "Ошибка",
  STALE: "Устарело",
  NEVER_SYNCED: "Ещё не синхронизировано",
  SUCCESS_EMPTY: "Нет данных в 1С",
};

const RETRY_LABELS: Record<AdminOperationalIssue["automaticRetryState"], string> = {
  SCHEDULED: "Ожидает следующего планового запуска",
  RUNNING: "Выполняется сейчас",
  NOT_CONFIGURED: "Автоматическое восстановление не настроено",
  NOT_REQUIRED: "Повторный запуск не требуется",
};

export function AdminOperationalIssueList({
  issues,
}: {
  issues: readonly AdminOperationalIssue[];
}) {
  if (!issues.length) {
    return (
      <p className="border border-emerald-200 bg-emerald-50 p-8 text-center text-emerald-900">
        Активных операционных проблем нет.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="active-operational-issues">
      {issues.map((issue) => (
        <article className="border border-zinc-200 bg-white p-4" key={issue.id}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className={`text-xs font-semibold uppercase ${issue.severity === "HIGH" ? "text-red-700" : "text-amber-700"}`}>
                {issue.severity === "HIGH" ? "Высокий приоритет" : "Требует проверки"}
              </p>
              <h2 className="mt-1 text-lg font-semibold">{domainLabel(issue.domain)}</h2>
              <p className="mt-1 text-sm text-zinc-700">{issue.safeMessage}</p>
              <p className="mt-2 text-xs text-zinc-500">
                Последнее проявление: {formatDate(issue.lastSeenAt)}
              </p>
            </div>
            <Link
              className="inline-flex min-h-11 shrink-0 items-center justify-center border border-zinc-300 px-4 text-sm font-semibold text-emerald-800 hover:border-emerald-600"
              href={issue.detailHref}
              prefetch={false}
            >
              Подробнее →
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}

export function AdminOperationalIssueDetail({
  canManage,
  issue,
}: {
  canManage: boolean;
  issue: AdminOperationalIssue;
}) {
  const technicalSummary = [
    `Issue ID: ${issue.id}`,
    `Domain: ${issue.domain}`,
    `Run ID: ${issue.runId ?? "—"}`,
    `Correlation ID: ${issue.correlationId ?? "—"}`,
    `Stage: ${issue.stage}`,
    `Code: ${issue.safeErrorCode ?? "—"}`,
    `Technical code: ${issue.technicalCode ?? "—"}`,
    `Received: ${issue.received}`,
    `Staged: ${issue.staged}`,
    `Published: ${issue.published}`,
    `Duration: ${issue.durationMs ?? "—"}`,
    `Source calls: ${issue.sourceCalls}`,
    `Retry count: ${issue.retryCount}`,
  ].join("\n");

  return (
    <div className="space-y-5">
      <section className="border border-zinc-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-red-700">Операционная диагностика</p>
            <h1 className="mt-2 text-2xl font-semibold">{domainLabel(issue.domain)}</h1>
          </div>
          <span className="border border-red-200 bg-red-50 px-3 py-1 text-sm font-semibold text-red-800">
            {STATUS_LABELS[issue.healthStatus]}
          </span>
        </div>

        <dl className="mt-6 grid gap-x-8 gap-y-5 md:grid-cols-2">
          <DiagnosticRow label="Этап" value={issue.stage} />
          <DiagnosticRow label="Причина" value={issue.safeMessage ?? "Причина не зафиксирована."} />
          <DiagnosticRow label="Начало проблемы" value={formatDate(issue.startedAt)} />
          <DiagnosticRow label="Последнее проявление" value={formatDate(issue.lastSeenAt)} />
          <DiagnosticRow label="Последняя успешная синхронизация" value={formatDate(issue.lastSuccessAt)} />
          <DiagnosticRow label="Затронутая область" value={issue.affectedScope} />
          <DiagnosticRow label="Текущие данные" value={issue.currentDataState} />
          <DiagnosticRow label="Автоматическое восстановление" value={RETRY_LABELS[issue.automaticRetryState]} />
        </dl>
      </section>

      <AdminIssueActions
        canManage={canManage}
        domain={issue.domain}
        historyHref={issue.historyHref}
        issueId={issue.id}
        technicalSummary={technicalSummary}
      />

      <details className="border border-zinc-200 bg-white p-5">
        <summary className="cursor-pointer font-semibold">Технические данные</summary>
        <dl className="mt-5 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
          <DiagnosticRow label="Run ID" value={issue.runId ?? "—"} mono />
          <DiagnosticRow label="Correlation ID" value={issue.correlationId ?? "—"} mono />
          <DiagnosticRow label="Код ошибки" value={issue.safeErrorCode ?? "—"} mono />
          <DiagnosticRow label="SQLSTATE / HTTP status" value={issue.technicalCode ?? "—"} mono />
          <DiagnosticRow label="Получено строк" value={String(issue.received)} />
          <DiagnosticRow label="Подготовлено строк" value={String(issue.staged)} />
          <DiagnosticRow label="Опубликовано строк" value={String(issue.published)} />
          <DiagnosticRow label="Длительность" value={issue.durationMs === null ? "—" : `${issue.durationMs} ms`} />
          <DiagnosticRow label="Обращений к источнику" value={String(issue.sourceCalls)} />
          <DiagnosticRow label="Повторных попыток" value={String(issue.retryCount)} />
          {issue.failedPage == null ? null : <DiagnosticRow label="Страница сбоя" value={String(issue.failedPage)} />}
        </dl>
      </details>
    </div>
  );
}

function DiagnosticRow({ label, mono, value }: { label: string; mono?: boolean; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className={`mt-1 break-words text-zinc-900 ${mono ? "font-mono text-xs" : "text-sm"}`}>{value}</dd>
    </div>
  );
}

function domainLabel(domain: string): string {
  return DOMAIN_LABELS[domain] ?? domain;
}

function formatDate(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
    : "Не зафиксировано";
}

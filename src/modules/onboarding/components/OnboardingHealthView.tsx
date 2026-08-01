import Link from "next/link";

import type { OnboardingHealth } from "../types";

export function OnboardingHealthView({ health }: { health: OnboardingHealth }) {
  const directory = health.directory;
  const queue = health.queue;

  return (
    <div className="space-y-6">
      <header className="border-b border-zinc-200 pb-5">
        <Link href="/admin/onboarding" className="text-sm font-medium text-emerald-700">
          ← К очереди
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">Состояние онбординга</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Безопасные операционные показатели локального справочника и очереди.
        </p>
      </header>

      <section aria-labelledby="directory-health">
        <h2 id="directory-health" className="text-lg font-semibold">Справочник контрагентов 1С</h2>
        {directory ? (
          <dl className="mt-4 grid gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Статус" value={directory.status} />
            <Metric label="Источник" value={String(directory.source_counterparties)} />
            <Metric label="Получено" value={String(directory.fetched_counterparties)} />
            <Metric label="Подготовлено" value={String(directory.staged_counterparties)} />
            <Metric label="Опубликовано" value={String(directory.published_counterparties)} />
            <Metric label="Пропущено" value={String(directory.skipped_counterparties)} />
            <Metric label="IDNO отсутствует" value={String(directory.without_fiscal_code)} />
            <Metric label="IDNO некорректен" value={String(directory.malformed_fiscal_codes)} />
            <Metric label="IDNO нормализован" value={String(directory.normalized_fiscal_codes_changed)} />
            <Metric label="Дубликаты IDNO" value={String(directory.duplicate_fiscal_codes)} />
            <Metric label="Повторы строк 1С" value={String(directory.duplicate_counterparty_rows)} />
            <Metric label="Запросов к страницам" value={String(directory.pages_processed)} />
            <Metric label="Длительность" value={`${directory.duration_ms} мс`} />
            <Metric label="Ошибочные строки" value={String(directory.failed_records)} />
            <Metric label="Менеджеры не сопоставлены" value={String(directory.unresolved_manager_references)} />
            <Metric label="Активная блокировка" value={directory.lock_acquired_at ? "Да" : "Нет"} />
            <Metric label="Безопасный код ошибки" value={directory.safe_error_code || "Нет"} />
            <Metric
              label="Обновлено"
              value={directory.finished_at ? formatDate(directory.finished_at) : "Синхронизация не завершена"}
            />
          </dl>
        ) : (
          <p className="mt-4 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-950">
            Справочник ещё не синхронизирован.
          </p>
        )}
      </section>

      {queue && (
        <section aria-labelledby="queue-health">
          <h2 id="queue-health" className="text-lg font-semibold">Очередь</h2>
          <dl className="mt-4 grid gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="Новые" value={String(queue.new)} />
            <Metric label="Без ответственного" value={String(queue.unassigned)} />
            <Metric label="Просрочены" value={String(queue.overdue)} />
            <Metric label="Конфликты сопоставления" value={String(queue.matchConflicts)} />
            <Metric label="Ожидают 1С" value={String(queue.awaitingOneCCompany)} />
          </dl>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-24 bg-white p-4">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-zinc-900">{value}</dd>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Chisinau",
  }).format(new Date(value));
}

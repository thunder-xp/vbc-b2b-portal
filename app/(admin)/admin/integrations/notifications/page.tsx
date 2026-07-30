import { getNotificationHealthAction } from "@/src/modules/notifications/actions";
import { requireAdminPagePermission } from "@/src/modules/admin/services";

export const dynamic = "force-dynamic";

export default async function NotificationHealthPage() {
  await requireAdminPagePermission("admin.integrations.view");
  const health = await getNotificationHealthAction();
  const run = health.lastShipmentWorkerRun;
  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm font-medium text-emerald-700">Интеграции</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-950">Уведомления</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Безопасная агрегированная диагностика генерации за последние 24 часа.
        </p>
      </header>
      <dl className="grid gap-px border border-zinc-200 bg-zinc-200 sm:grid-cols-3">
        <Metric label="Создано" value={health.generated} />
        <Metric label="Непрочитано" value={health.unread} />
        <Metric label="Дедуплицировано" value={health.deduplicated} />
      </dl>
      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold text-zinc-950">Планировщик отгрузок</h2>
        {run ? (
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
            <Detail label="Статус" value={run.status} />
            <Detail label="Бизнес-дата" value={run.businessDate} />
            <Detail label="Создано" value={String(run.notificationsCreated)} />
            <Detail label="Обработано событий" value={String(run.sourceEventsProcessed)} />
            <Detail label="Длительность" value={run.durationMs === null ? "Нет данных" : `${run.durationMs} мс`} />
            <Detail label="Завершён" value={run.finishedAt ?? "Нет данных"} />
          </dl>
        ) : (
          <p className="mt-3 text-sm text-zinc-600">Запусков пока нет.</p>
        )}
      </section>
      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold text-zinc-950">Последние сбои</h2>
        {health.recentFailures.length ? (
          <ul className="mt-3 divide-y divide-zinc-100">
            {health.recentFailures.map((failure) => (
              <li className="py-3 text-sm" key={failure.runId}>
                <span className="font-medium text-zinc-900">{failure.worker}</span>
                <span className="ml-2 text-zinc-500">{failure.safeErrorCode ?? "unknown"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-zinc-600">Недавних сбоев нет.</p>
        )}
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="bg-white p-4"><dt className="text-sm text-zinc-600">{label}</dt><dd className="mt-1 text-2xl font-semibold text-zinc-950">{value}</dd></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-zinc-500">{label}</dt><dd className="mt-1 font-medium text-zinc-950">{value}</dd></div>;
}

import Link from "next/link";

import type {
  AdminIntegrationCenter,
  AdminIntegrationIncident,
  AdminSyncJobPage,
} from "../types";

export function AdminIntegrationCenterView({
  center,
}: {
  center: AdminIntegrationCenter;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {center.domains.map((item) => (
        <article className="border border-zinc-200 bg-white p-4" key={item.domain}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">{item.domain}</h2>
            <span className="text-xs uppercase text-zinc-600">{item.status}</span>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Получено" value={item.received} />
            <Row label="Опубликовано" value={item.published} />
            <Row label="Исключено" value={item.excluded} />
          </dl>
          <p className="mt-3 text-xs text-zinc-500">
            {item.lastSuccessAt
              ? formatDate(item.lastSuccessAt)
              : "Успешный запуск не зафиксирован"}
          </p>
        </article>
      ))}
    </div>
  );
}

export function AdminSyncJobTable({ page }: { page: AdminSyncJobPage }) {
  return (
    <div className="overflow-x-auto border border-zinc-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50">
          <tr>
            {["Домен", "Статус", "Триггер", "Актор", "Запуск", "Длительность"].map(
              (label) => (
                <th className="px-4 py-3 font-semibold" key={label}>
                  {label}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {page.items.map((job) => (
            <tr key={job.run_id}>
              <td className="px-4 py-3">{job.domain}</td>
              <td className="px-4 py-3">{job.status}</td>
              <td className="px-4 py-3">{job.trigger_type}</td>
              <td className="px-4 py-3">{job.actor ?? "system"}</td>
              <td className="px-4 py-3">{formatDate(job.started_at)}</td>
              <td className="px-4 py-3">
                {job.duration_ms === null ? "—" : `${job.duration_ms} ms`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!page.items.length ? (
        <p className="p-8 text-center text-sm text-zinc-500">Запуски не найдены.</p>
      ) : null}
    </div>
  );
}

export function AdminIncidentList({
  incidents,
}: {
  incidents: readonly AdminIntegrationIncident[];
}) {
  if (!incidents.length) {
    return <p className="border border-zinc-200 bg-white p-8 text-center">Активных инцидентов нет.</p>;
  }
  return (
    <div className="space-y-3">
      {incidents.map((incident) => (
        <article className="border border-zinc-200 bg-white p-4" key={`${incident.domain}-${incident.code}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-red-700">
                {incident.severity} · {incident.domain}
              </p>
              <h2 className="mt-1 font-semibold">{incident.code}</h2>
              <p className="mt-1 text-sm text-zinc-600">{incident.recommendedAction}</p>
            </div>
            <Link className="text-sm font-semibold text-emerald-700" href={incident.href}>
              Открыть
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-zinc-600">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

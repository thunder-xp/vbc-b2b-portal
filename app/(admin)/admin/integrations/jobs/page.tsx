import {
  AdminPageHeader,
  AdminSyncJobTable,
  createAdminOperationsService,
  requireAdminPagePermission,
} from "@/src/modules/admin";
import {
  enqueueOrderHistoryBootstrapAction,
  enqueueOrderHistoryIntegrityAuditAction,
  listOrderHistoryBootstrapsAction,
  listOrderHistoryIntegrityAuditsAction,
} from "@/src/modules/orders/actions";
import { listCustomerExternalProvisioningDiagnostics } from "@/src/modules/final-customer-provisioning/admin-diagnostics";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminIntegrationJobsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdminPagePermission("admin.integrations.view");
  const params = await searchParams;
  const [page, bootstraps, integrityAudits, customerProvisioning] = await Promise.all([createAdminOperationsService().listSyncJobs({
    domain: scalar(params.domain),
    status: scalar(params.status),
    trigger: scalar(params.trigger),
    from: scalar(params.from),
    to: scalar(params.to),
    page: Number(scalar(params.page) ?? 1),
  }), listOrderHistoryBootstrapsAction(), listOrderHistoryIntegrityAuditsAction(), listCustomerExternalProvisioningDiagnostics()]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Ограниченный журнал ручных интеграционных запусков."
        eyebrow="Интеграции"
        title="Задания"
      />
      <AdminSyncJobTable page={page} />
      <section aria-labelledby="customer-external-provisioning" className="space-y-3 border-t border-zinc-200 pt-6">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950" id="customer-external-provisioning">1C Final Customer provisioning</h2>
          <p className="mt-1 text-sm text-zinc-600">Safe reconciliation state only; customer contact data and 1C identifiers are not displayed.</p>
        </div>
        <div className="overflow-x-auto border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="p-3">Job</th><th className="p-3">State</th><th className="p-3">Attempts</th><th className="p-3">Candidates</th><th className="p-3">Create / read-back / map</th><th className="p-3">Safe error</th><th className="p-3">Age</th></tr></thead>
            <tbody className="divide-y divide-zinc-200">{customerProvisioning.map((job) => (
              <tr key={job.job_id}>
                <td className="p-3 font-mono text-xs">{job.job_id.slice(0, 8)}</td>
                <td className="p-3 font-medium">{job.state}</td>
                <td className="p-3">{job.attempt_count}</td>
                <td className="p-3">{job.candidate_count ?? "—"}</td>
                <td className="p-3">{yesNo(job.create_attempted)} / {yesNo(job.read_back_succeeded)} / {yesNo(job.mapping_persisted)}</td>
                <td className="p-3">{job.safe_error_code ?? "—"}</td>
                <td className="p-3">{formatAge(job.age_seconds)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      {bootstraps.success ? (
        <section aria-labelledby="order-history-bootstrap" className="space-y-4 border-t border-zinc-200 pt-6">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950" id="order-history-bootstrap">Загрузка истории заказов партнёров</h2>
            <p className="mt-1 text-sm text-zinc-600">Фоновая первичная загрузка после подключения компании к 1С.</p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Не запрошено", bootstraps.data.summary.notRequested], ["В очереди", bootstraps.data.summary.queued],
              ["В работе", bootstraps.data.summary.running], ["Завершено", bootstraps.data.summary.succeeded],
              ["Ошибка", bootstraps.data.summary.failed], ["Устарело", bootstraps.data.summary.stale],
            ].map(([label, value]) => <div className="border border-zinc-200 bg-white p-3" key={String(label)}><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 text-xl font-semibold">{value}</dd></div>)}
          </dl>
          <div className="overflow-x-auto border border-zinc-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="p-3">Компания</th><th className="p-3">Статус</th><th className="p-3">Источник / опубликовано</th><th className="p-3">Период</th><th className="p-3">Действие</th></tr></thead>
              <tbody className="divide-y divide-zinc-200">{bootstraps.data.items.map((item) => (
                <tr key={item.id}>
                  <td className="p-3 font-medium">{item.companyName}</td><td className="p-3">{bootstrapLabel(item.status)}</td>
                  <td className="p-3">{item.sourceRows} / {item.publishedRows}{item.rejectedRows ? ` · отклонено ${item.rejectedRows}` : ""}</td>
                  <td className="p-3 text-zinc-600">{formatRange(item.earliestOrderAt, item.latestOrderAt)}</td>
                  <td className="p-3"><div className="flex flex-wrap gap-2"><form action={enqueueOrderHistoryBootstrapAction}><input name="companyId" type="hidden" value={item.companyId} /><button className="min-h-11 rounded-md border border-zinc-300 px-3 font-semibold hover:border-emerald-600" type="submit">Загрузить историю заказов</button></form><form action={enqueueOrderHistoryIntegrityAuditAction}><input name="companyId" type="hidden" value={item.companyId} /><button className="min-h-11 rounded-md border border-zinc-300 px-3 font-semibold hover:border-blue-600" type="submit">Проверить целостность</button></form></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ) : null}
      {integrityAudits.success && integrityAudits.data.length ? (
        <section aria-labelledby="order-history-integrity" className="space-y-3 border-t border-zinc-200 pt-6">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950" id="order-history-integrity">Проверки целостности истории заказов</h2>
            <p className="mt-1 text-sm text-zinc-600">Редкая двухпроходная проверка выполняется в фоне. Обычная синхронизация остаётся инкрементальной.</p>
          </div>
          <div className="overflow-x-auto border border-zinc-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="p-3">Компания</th><th className="p-3">Статус</th><th className="p-3">Проходы</th><th className="p-3">Скрыто</th><th className="p-3">Завершено</th></tr></thead>
              <tbody className="divide-y divide-zinc-200">{integrityAudits.data.map((audit) => <tr key={audit.id}><td className="p-3 font-medium">{audit.companyName}</td><td className="p-3">{audit.status}</td><td className="p-3">{audit.passOneCount ?? "—"} / {audit.passTwoCount ?? "—"}</td><td className="p-3">{audit.hiddenCount}</td><td className="p-3 text-zinc-600">{audit.finishedAt ? new Date(audit.finishedAt).toLocaleString("ru-RU") : "—"}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function bootstrapLabel(status: string): string {
  return ({ queued: "В очереди", running: "В работе", succeeded: "Завершено", failed_retryable: "Повтор будет выполнен", failed_terminal: "Требует проверки", stale: "Устарело" } as Record<string, string>)[status] ?? status;
}

function formatRange(from: string | null, to: string | null): string {
  if (!from && !to) return "Нет данных";
  const format = (value: string | null) => value ? new Date(value).toLocaleDateString("ru-RU") : "—";
  return `${format(from)} — ${format(to)}`;
}

function scalar(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function yesNo(value: boolean) { return value ? "YES" : "NO"; }
function formatAge(seconds: number) { return `${Math.max(0, Math.floor(seconds / 60))} min`; }

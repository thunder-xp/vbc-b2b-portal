import type { AdminFinanceOperations } from "../types";

export function AdminFinanceOperationsPanel({ data }: { data: AdminFinanceOperations }) {
  const metrics = [
    ["Поддерживаются", data.supported], ["Открытые", data.open], ["Частично оплачены", data.partial],
    ["Оплачены", data.settled], ["Просрочены", data.overdue], ["Срок сегодня", data.dueToday],
    ["Следующие 7 дней", data.dueNext7], ["Следующие 30 дней", data.dueNext30],
    ["Компании с просрочкой", data.companiesOverdue], ["Не сверены", data.nonReconciling],
    ["Не поддерживаются", data.unsupported], ["Устаревшие данные", data.stale],
    ["Missing recipient email", data.missingEmail],
  ] as const;
  return <div className="space-y-5">
    <section aria-label="Состояние платежных обязательств" className="grid grid-cols-2 gap-px border border-zinc-200 bg-zinc-200 md:grid-cols-3 xl:grid-cols-6">
      {metrics.map(([label, value]) => <div className="bg-white p-4" key={label}><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums text-zinc-950">{value}</p></div>)}
    </section>
    <div className="grid gap-5 lg:grid-cols-3">
      <MetricList title="Просрочено по валютам" values={data.overdueByCurrency} />
      <MetricList title="Возраст просрочки" values={data.ageing} />
      <MetricList title="Исключения" values={data.unsupportedByReason} />
    </div>
    <section className="border border-zinc-200 bg-white p-4">
      <h2 className="font-semibold text-zinc-950">FINANCE_REMINDER_V1</h2>
      <p className="mt-1 text-sm font-semibold text-amber-800">OUTBOUND_MODE: DRY_RUN · SMS_ENABLED: FALSE</p>
      {data.latestDryRun ? <dl className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4"><Value label="Компании" value={data.latestDryRun.eligible_company_count} /><Value label="Email-проекции" value={data.latestDryRun.projected_email_count} /><Value label="In-app проекции" value={data.latestDryRun.projected_in_app_count} /><Value label="Подавлено" value={data.latestDryRun.suppressed_count} /></dl> : <p className="mt-3 text-sm text-zinc-600">Dry-run ещё не выполнялся.</p>}
    </section>
  </div>;
}

function MetricList({ title, values }: { title: string; values: Record<string, string | number> }) {
  const entries = Object.entries(values);
  return <section className="border border-zinc-200 bg-white p-4"><h2 className="font-semibold text-zinc-950">{title}</h2>{entries.length ? <dl className="mt-3 divide-y divide-zinc-100">{entries.map(([label, value]) => <div className="flex justify-between gap-3 py-2 text-sm" key={label}><dt className="text-zinc-600">{label}</dt><dd className="font-semibold tabular-nums text-zinc-950">{String(value)}</dd></div>)}</dl> : <p className="mt-3 text-sm text-zinc-500">Нет данных</p>}</section>;
}

function Value({ label, value }: { label: string; value: unknown }) {
  return <div><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 font-semibold tabular-nums text-zinc-950">{String(value ?? 0)}</dd></div>;
}

import Link from "next/link";

import {
  SERVICE_STATUS_LABELS,
  type ServiceDashboardItem,
} from "./types";

export function ServiceDashboardBlock({ items }: { items: ServiceDashboardItem[] }) {
  if (!items.length) return null;

  return (
    <section aria-labelledby="service-dashboard-title" className="border-t border-zinc-200 pt-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold" id="service-dashboard-title">Сервисные заявки</h2>
        <Link className="min-h-11 py-3 text-sm font-semibold text-emerald-700" href="/cabinet/service">Все заявки</Link>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <article className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-zinc-200 p-4" key={item.id}>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-emerald-700">{item.caseNumber}</p>
              <h3 className="mt-1 truncate font-semibold" title={item.productName ?? item.caseNumber}>{item.productName ?? "Сервисная заявка"}</h3>
              <p className="mt-2 text-sm text-zinc-600">{SERVICE_STATUS_LABELS[item.status]}</p>
              <p className="mt-1 text-sm font-medium">{item.nextAction}</p>
            </div>
            <Link aria-label={`Открыть заявку ${item.caseNumber}`} className="min-h-11 self-end rounded-md border border-zinc-300 px-3 py-2.5 text-sm font-semibold" href={item.href}>Открыть</Link>
          </article>
        ))}
      </div>
    </section>
  );
}

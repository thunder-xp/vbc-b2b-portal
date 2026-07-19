import { CalendarClock } from "lucide-react";
import Link from "next/link";

import { listPlannedShipmentsAction } from "@/src/modules/orders/actions";
import type { PlannedShipmentIndicator } from "@/src/modules/orders/services";

export default async function PlannedShipmentsPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const params = await searchParams;
  const page = typeof params.page === "string" ? params.page : null;
  const result = await listPlannedShipmentsAction({ page });

  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="border-b border-zinc-200 pb-5">
      <p className="text-xs font-semibold uppercase text-emerald-700">Резервирование</p>
      <h1 className="mt-1 text-2xl font-semibold">Планируемые отгрузки</h1>
      <p className="mt-2 text-sm text-zinc-600">Контролируйте заказы, оборудование по которым планируется удерживать до даты отгрузки.</p>
    </header>

    {!result.success ? <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">Не удалось загрузить планируемые отгрузки.</p> : result.data.shipments.length ? <>
      <div className="overflow-hidden border-y border-zinc-200 bg-white">
        <div className="hidden grid-cols-[minmax(12rem,1fr)_10rem_10rem_8rem_8rem_10rem] gap-3 bg-zinc-50 px-4 py-3 text-xs font-semibold uppercase text-zinc-500 lg:grid"><span>Заказ</span><span>Планируемая отгрузка</span><span>Состояние 1С</span><span>Состав</span><span>Срок</span><span>Обновлено</span></div>
        <ul className="divide-y divide-zinc-200">{result.data.shipments.map((shipment) => <li key={shipment.id}><Link className="grid gap-2 px-4 py-4 hover:bg-zinc-50 lg:grid-cols-[minmax(12rem,1fr)_10rem_10rem_8rem_8rem_10rem] lg:items-center" href={`/cabinet/orders/${shipment.id}`} prefetch={false}>
          <span className="font-semibold text-zinc-950">{shipment.primaryLabel}</span>
          <span className="text-sm text-zinc-700">{formatDate(shipment.deliveryDate!)}</span>
          <span className="text-sm text-zinc-700">{shipment.statusLabel}</span>
          <span className="text-sm text-zinc-600">{shipment.positionCount} поз. · {shipment.totalUnitCount} ед.</span>
          <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${indicatorTone(shipment.dateIndicator)}`}>{shipment.dateIndicatorLabel}</span>
          <span className="text-xs text-zinc-500">{formatDateTime(shipment.lastSynchronizedAt)}</span>
        </Link></li>)}</ul>
      </div>
      {result.data.totalPages > 1 && <nav aria-label="Страницы планируемых отгрузок" className="flex items-center justify-between text-sm"><PageLink disabled={result.data.page <= 1} page={result.data.page - 1}>Назад</PageLink><span className="text-zinc-500">Страница {result.data.page} из {result.data.totalPages}</span><PageLink disabled={result.data.page >= result.data.totalPages} page={result.data.page + 1}>Далее</PageLink></nav>}
    </> : <section className="border-y border-dashed border-zinc-300 bg-white px-6 py-14 text-center"><CalendarClock className="mx-auto size-8 text-emerald-700" /><h2 className="mt-4 font-semibold">Планируемых отгрузок пока нет</h2><p className="mt-1 text-sm text-zinc-500">Здесь появятся активные заказы с датой отгрузки из 1С.</p></section>}
  </div>;
}

function PageLink({ disabled, page, children }: { disabled: boolean; page: number; children: React.ReactNode }) { return <Link aria-disabled={disabled} className={disabled ? "pointer-events-none text-zinc-300" : "font-semibold text-emerald-700"} href={`/cabinet/reservation-requests?page=${Math.max(1, page)}`} prefetch={false}>{children}</Link>; }
function indicatorTone(value: PlannedShipmentIndicator) { return value === "overdue" ? "bg-red-100 text-red-800" : value === "today" ? "bg-amber-100 text-amber-900" : value === "soon" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"; }
function formatDate(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU"); }
function formatDateTime(value: string) { return new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }); }

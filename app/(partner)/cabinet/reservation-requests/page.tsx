import { CalendarClock } from "lucide-react";
import Link from "next/link";

import { listPlannedShipmentsAction } from "@/src/modules/orders/actions";
import { CancelOrderDateChangeButton, OrderDateChangeDialog } from "@/src/modules/orders/components";
import type { PlannedShipmentDto, PlannedShipmentIndicator } from "@/src/modules/orders/services";

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
        <div className="hidden grid-cols-[minmax(11rem,1fr)_9rem_9rem_7rem_8rem_11rem] gap-3 bg-zinc-50 px-4 py-3 text-xs font-semibold uppercase text-zinc-500 lg:grid"><span>Заказ</span><span>Планируемая отгрузка</span><span>Состояние 1С</span><span>Состав</span><span>Срок</span><span>Действие</span></div>
        <ul className="divide-y divide-zinc-200">{result.data.shipments.map((shipment) => <li className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(11rem,1fr)_9rem_9rem_7rem_8rem_11rem] lg:items-center" key={shipment.id}>
          <div><Link className="font-semibold text-zinc-950 hover:text-emerald-700" href={`/cabinet/orders/${shipment.id}`} prefetch={false}>{shipment.primaryLabel}</Link><div className="mt-1 text-xs text-zinc-500">Обновлено {formatDateTime(shipment.lastSynchronizedAt)}</div></div>
          <span className="text-sm text-zinc-700">{formatDate(shipment.deliveryDate!)}</span>
          <span className="text-sm text-zinc-700">{shipment.statusLabel}</span>
          <span className="text-sm text-zinc-600">{shipment.positionCount} поз. · {shipment.totalUnitCount} ед.</span>
          <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${indicatorTone(shipment.dateIndicator)}`}>{shipment.dateIndicatorLabel}</span>
          <RequestCell shipment={shipment} />
        </li>)}</ul>
      </div>
      {result.data.totalPages > 1 && <nav aria-label="Страницы планируемых отгрузок" className="flex items-center justify-between text-sm"><PageLink disabled={result.data.page <= 1} page={result.data.page - 1}>Назад</PageLink><span className="text-zinc-500">Страница {result.data.page} из {result.data.totalPages}</span><PageLink disabled={result.data.page >= result.data.totalPages} page={result.data.page + 1}>Далее</PageLink></nav>}
    </> : <section className="border-y border-dashed border-zinc-300 bg-white px-6 py-14 text-center"><CalendarClock className="mx-auto size-8 text-emerald-700" /><h2 className="mt-4 font-semibold">Планируемых отгрузок пока нет</h2><p className="mt-1 text-sm text-zinc-500">Здесь появятся активные заказы с датой отгрузки из 1С.</p></section>}
  </div>;
}

function RequestCell({ shipment }: { shipment: PlannedShipmentDto }) {
  const request = shipment.dateChangeRequest;
  if (!request || request.status === "cancelled" || request.status === "rejected") return <div className="space-y-2">{request && <p className="text-xs text-zinc-500">{request.statusLabel}</p>}<OrderDateChangeDialog currentDate={shipment.deliveryDate!} orderHistoryId={shipment.id} /></div>;
  return <div className="space-y-1 text-sm"><p className="font-semibold">{request.statusLabel}</p><p className="text-xs text-zinc-500">Новая дата: {formatDate(request.requestedDate)}</p>{request.awaitingOneC && <p className="text-xs text-amber-700">Ожидается обновление даты в 1С</p>}{request.status === "pending" && <CancelOrderDateChangeButton requestId={request.id} />}</div>;
}
function PageLink({ disabled, page, children }: { disabled: boolean; page: number; children: React.ReactNode }) { return <Link aria-disabled={disabled} className={disabled ? "pointer-events-none text-zinc-300" : "font-semibold text-emerald-700"} href={`/cabinet/reservation-requests?page=${Math.max(1, page)}`} prefetch={false}>{children}</Link>; }
function indicatorTone(value: PlannedShipmentIndicator) { return value === "overdue" ? "bg-red-100 text-red-800" : value === "today" ? "bg-amber-100 text-amber-900" : value === "soon" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"; }
function formatDate(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU"); }
function formatDateTime(value: string) { return new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }); }

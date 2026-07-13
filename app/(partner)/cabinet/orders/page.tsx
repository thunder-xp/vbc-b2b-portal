import Link from "next/link";

import { listPartnerOrdersAction } from "@/src/modules/orders/actions";

const STATUS_LABELS: Record<string, string> = {
  processing: "Создание в 1С",
  submitted: "Создан в 1С",
  failed: "Не создан",
  unknown: "Требует проверки",
};

export default async function OrdersPage() {
  const result = await listPartnerOrdersAction();
  if (!result.success) return <p className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{result.message}</p>;

  return <div className="mx-auto max-w-6xl space-y-6">
    <header><p className="text-xs font-semibold uppercase text-emerald-700">Коммерческие документы</p><h1 className="mt-1 text-2xl font-semibold">Заказы</h1></header>
    {result.data.length === 0 ? <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center"><h2 className="font-semibold">Заказов пока нет</h2><Link className="mt-4 inline-flex text-sm font-semibold text-emerald-700" href="/cabinet/catalog">Перейти в каталог</Link></div> :
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white"><ul className="divide-y divide-zinc-200">{result.data.map((order) => <li key={order.id}><Link className="grid gap-2 p-4 hover:bg-zinc-50 sm:grid-cols-4" href={`/cabinet/orders/${order.id}`}><span className="font-semibold">{order.external1cNumber ? `Заказ ${order.external1cNumber}` : "Заказ обрабатывается"}</span><span className="text-sm text-zinc-600">{STATUS_LABELS[order.status]}</span><span className="text-sm text-zinc-600">Отгрузка: {order.requestedDeliveryDate}</span><span className="text-sm text-zinc-500 sm:text-right">{new Date(order.createdAt).toLocaleDateString("ru-RU")}</span></Link></li>)}</ul></div>}
  </div>;
}

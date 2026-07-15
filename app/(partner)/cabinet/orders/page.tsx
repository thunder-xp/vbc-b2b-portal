import Link from "next/link";

import { listPartnerOrdersAction } from "@/src/modules/orders/actions";

const STATUS_LABELS: Record<string, string> = {
  processing: "Создаётся",
  confirmed: "Подтверждён",
  failed: "Не создан",
  reconciliation_required: "Статус уточняется",
  confirmed_not_created: "Не создан",
  manual_review_required: "Проверяется Novotech",
};

export default async function OrdersPage() {
  const result = await listPartnerOrdersAction();
  if (!result.success) {
    return <p className="rounded-md border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">Не удалось загрузить заказы. Повторите попытку позже.</p>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase text-emerald-700">Коммерческие документы</p>
        <h1 className="mt-1 text-2xl font-semibold">Заказы</h1>
        <p className="mt-2 text-sm text-zinc-600">Заказы, созданные вашей компанией через партнёрскую платформу.</p>
      </header>

      {result.data.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 bg-white p-8 text-center">
          <h2 className="font-semibold">Заказов пока нет</h2>
          <p className="mt-2 text-sm text-zinc-600">Соберите товары в корзине и отправьте первый заказ.</p>
          <Link className="mt-4 inline-flex rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800" href="/cabinet/catalog">Открыть каталог</Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <div className="hidden grid-cols-[minmax(150px,1fr)_120px_140px_130px_120px_120px] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold uppercase text-zinc-500 lg:grid">
            <span>Заказ</span><span>Дата</span><span>Статус</span><span>Сумма</span><span>Отгрузка</span><span>Состав</span>
          </div>
          <ul className="divide-y divide-zinc-200">
            {result.data.map((order) => (
              <li key={order.id}>
                <Link className="grid gap-2 p-4 outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 lg:grid-cols-[minmax(150px,1fr)_120px_140px_130px_120px_120px] lg:items-center" href={`/cabinet/orders/${order.id}`}>
                  <span className="font-semibold text-zinc-950">{order.external1cNumber ? `№ ${order.external1cNumber}` : "Заказ обрабатывается"}</span>
                  <span className="text-sm text-zinc-600">{new Date(order.confirmedAt ?? order.createdAt).toLocaleDateString("ru-RU")}</span>
                  <span className="text-sm font-medium text-zinc-700">{STATUS_LABELS[order.integrationStatus] ?? "Обрабатывается"}</span>
                  <span className="text-sm font-semibold text-zinc-950">{order.documentTotal ?? "Недоступно"}</span>
                  <span className="text-sm text-zinc-600">{new Date(`${order.requestedDeliveryDate}T00:00:00`).toLocaleDateString("ru-RU")}</span>
                  <span className="text-sm text-zinc-600">{order.positionCount} поз. · {order.totalUnitCount} ед.</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

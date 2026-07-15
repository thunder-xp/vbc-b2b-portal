import Link from "next/link";
import { notFound } from "next/navigation";

import { getPartnerOrderAction } from "@/src/modules/orders/actions";

const STATUS_LABELS: Record<string, string> = {
  processing: "Создаётся в 1С",
  confirmed: "Подтверждён",
  failed: "Не создан",
  reconciliation_required: "Статус отправки уточняется",
  confirmed_not_created: "Не создан в 1С",
  manual_review_required: "Требуется проверка Novotech",
};

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getPartnerOrderAction(id);
  if (!result.success) notFound();
  const order = result.data;
  const confirmed = order.integrationStatus === "confirmed" && order.external1cNumber;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {confirmed && (
        <section className="rounded-md border border-emerald-200 bg-emerald-50 px-5 py-4" aria-labelledby="order-success-title">
          <h1 className="font-semibold text-emerald-950" id="order-success-title">Заказ успешно создан</h1>
          <p className="mt-1 text-sm text-emerald-800">Ваш заказ № {order.external1cNumber} принят и передан в обработку.</p>
        </section>
      )}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">Заказ партнёра</p>
          <h2 className="mt-1 text-2xl font-semibold">{order.external1cNumber ? `Заказ № ${order.external1cNumber}` : "Заказ"}</h2>
          <p className="mt-2 text-sm text-zinc-600">{STATUS_LABELS[order.integrationStatus] ?? "Обрабатывается"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50" href="/cabinet/orders">Все заказы</Link>
          <Link className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800" href="/cabinet/catalog">Продолжить покупки</Link>
        </div>
      </header>

      <dl className="grid gap-px overflow-hidden rounded-md border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-4">
        <OrderFact label="Компания" value={order.companyName} />
        <OrderFact label="Дата создания" value={formatDate(order.confirmedAt ?? order.createdAt)} />
        <OrderFact label="Дата отгрузки" value={formatDate(order.requestedDeliveryDate)} />
        <OrderFact label="Сумма" value={order.documentTotal ?? "Недоступно"} />
        <OrderFact label="Позиций" value={String(order.positionCount)} />
        <OrderFact label="Единиц товара" value={String(order.totalUnitCount)} />
        <OrderFact label="Договор" value={order.contractNumber ?? "Недоступно"} />
        <OrderFact label="Синхронизация" value={formatDateTime(order.lastSynchronizedAt)} />
      </dl>

      <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
        <div className="min-w-[680px]">
          <div className="grid grid-cols-[minmax(260px,1fr)_90px_150px_150px] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold uppercase text-zinc-500">
            <span>Товар</span><span>Количество</span><span>Цена</span><span>Сумма</span>
          </div>
          {order.lines.map((line) => (
            <div className="grid grid-cols-[minmax(260px,1fr)_90px_150px_150px] gap-3 border-b border-zinc-100 px-4 py-4 text-sm last:border-0" key={`${line.sku}-${line.productName}`}>
              <span><strong className="block">{line.productName}</strong><span className="text-xs text-zinc-500">Артикул: {line.sku}</span></span>
              <span>{line.quantity}</span><span>{line.unitPrice}</span><span className="font-semibold">{line.lineTotal}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-zinc-500">Данные заказа сохранены на момент отправки и доступны только для чтения.</p>
    </div>
  );
}

function OrderFact({ label, value }: { label: string; value: string }) {
  return <div className="bg-white p-4"><dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-zinc-950">{value}</dd></div>;
}

function formatDate(value: string): string {
  return new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString("ru-RU");
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

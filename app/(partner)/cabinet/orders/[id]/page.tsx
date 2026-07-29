import Link from "next/link";
import { notFound } from "next/navigation";

import { getPartnerOrderHistoryAction } from "@/src/modules/orders/actions";
import { SaveAsPurchasingListButton } from "@/src/modules/purchasing-lists/components";

type OrderDetailPageProps = { params: Promise<{ id: string }>; searchParams?: Promise<{ submitted?: string | string[] }> };

export default async function OrderDetailPage({ params, searchParams }: OrderDetailPageProps) {
  const { id } = await params;
  const submitted = searchParams ? (await searchParams).submitted === "1" : false;
  const result = await getPartnerOrderHistoryAction(id);
  if (!result.success) {
    if (result.errorCode === "NOT_FOUND") notFound();
    return <p className="rounded-md border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">Не удалось загрузить заказ.</p>;
  }
  const order = result.data;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {submitted || !order.posted ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-950" role="status">
          <h1 className="text-lg font-semibold">Заказ принят</h1>
          <p className="mt-1 text-sm">Заказ получен Novotech. После обработки актуальный статус появится на этой странице и в разделе «Заказы».</p>
          <div className="mt-3 flex flex-wrap gap-2"><Link className="text-sm font-semibold text-emerald-800 underline underline-offset-4" href="/cabinet/orders" prefetch={false}>Все заказы</Link><Link className="text-sm font-semibold text-emerald-800 underline underline-offset-4" href="/cabinet/catalog" prefetch={false}>Вернуться в каталог</Link></div>
        </div>
      ) : null}

      <section className="border-b border-zinc-200 pb-6">
        <p className="text-xs font-semibold uppercase text-emerald-700">Заказ партнёра</p>
        <h2 className="mt-1 text-2xl font-semibold">{order.primaryLabel}</h2>
        <p className="mt-2 text-sm font-medium text-zinc-700">{order.statusLabel}</p>
        <p className="mt-1 text-xs text-zinc-500">{order.freshness.label}</p>
        {order.freshness.staleNotice ? <p className="mt-1 text-xs text-amber-700">{order.freshness.staleNotice}</p> : null}
        {order.originLabel ? <p className="mt-1 text-sm text-zinc-500">{order.originLabel}</p> : null}
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Компания" value={order.companyName} />
          <Metric label="Дата заказа" value={formatDate(order.documentDate)} />
          <Metric label="Планируемая отгрузка" value={order.deliveryDate ? formatDate(order.deliveryDate) : "Не указана"} />
          {order.documentTotal ? <Metric label="Сумма в 1С" value={order.documentTotal} /> : null}
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800" href={`/cabinet/orders/${order.id}/reorder`} prefetch={false}>Купить снова</Link>
          <Link className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50" href={`/cabinet/orders/${order.id}/reorder`} prefetch={false}>Выбрать позиции</Link>
          <SaveAsPurchasingListButton orderId={order.id} source="order" />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Текущий состав в 1С</h2>
        <div className="mt-3 overflow-hidden rounded-md border border-zinc-200 bg-white">
          <ul className="divide-y divide-zinc-200">
            {order.lines.map((line, index) => (
              <li className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_90px_140px_140px] sm:items-center" key={`${line.sku ?? line.productName}-${index}`}>
                <div><p className="font-medium text-zinc-950">{line.productName}</p>{line.sku ? <p className="text-xs text-zinc-500">{line.sku}</p> : null}</div>
                <span className="text-sm text-zinc-700">{line.quantity} ед.</span>
                <span className="text-sm text-zinc-700">{line.unitPrice ?? "Цена скрыта"}</span>
                <span className="text-sm font-semibold text-zinc-950">{line.lineTotal ?? "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {order.portalSnapshot ? (
        <section className="border-t border-zinc-200 pt-6">
          <h2 className="text-lg font-semibold">Снимок при отправке из платформы</h2>
          <p className="mt-1 text-sm text-zinc-500">Исходные партнёрские цены сохранены отдельно от текущего документа 1С.</p>
          {order.portalSnapshot.total ? <p className="mt-3 font-semibold">Итого: {order.portalSnapshot.total}</p> : <p className="mt-3 text-sm text-zinc-600">Коммерческие условия скрыты настройками доступа.</p>}
        </section>
      ) : null}

      {order.timeline.length ? (
        <section className="border-t border-zinc-200 pt-6">
          <h2 className="text-lg font-semibold">История</h2>
          <ol className="mt-3 space-y-3">
            {order.timeline.map((event, index) => (
              <li className="flex items-baseline justify-between gap-4 text-sm" key={`${event.occurredAt}-${index}`}>
                <span className="text-zinc-800">{event.label}</span>
                <time className="shrink-0 text-zinc-500">{formatDateTime(event.occurredAt)}</time>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs uppercase text-zinc-500">{label}</dt><dd className="mt-1 font-medium text-zinc-950">{value}</dd></div>;
}

function formatDate(value: string): string { return new Date(value).toLocaleDateString("ru-RU"); }
function formatDateTime(value: string): string { return new Date(value).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" }); }

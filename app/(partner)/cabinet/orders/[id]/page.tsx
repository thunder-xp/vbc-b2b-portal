import { notFound } from "next/navigation";

import { getPartnerOrderAction } from "@/src/modules/orders/actions";

const STATUS_LABELS: Record<string, string> = { processing: "Создание в 1С", submitted: "Создан в 1С", failed: "Не создан", unknown: "Требует проверки Novotech" };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getPartnerOrderAction(id);
  if (!result.success) notFound();
  const order = result.data;

  return <div className="mx-auto max-w-5xl space-y-6">
    <header><p className="text-xs font-semibold uppercase text-emerald-700">Заказ партнёра</p><h1 className="mt-1 text-2xl font-semibold">{order.external1cNumber ? `Заказ ${order.external1cNumber}` : "Заказ"}</h1><p className="mt-2 text-sm text-zinc-600">{STATUS_LABELS[order.status]} · Дата отгрузки {order.requestedDeliveryDate}</p></header>
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white"><div className="grid grid-cols-[minmax(0,1fr)_80px_140px_140px] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold uppercase text-zinc-500"><span>Товар</span><span>Кол-во</span><span>Цена</span><span>Сумма</span></div>{order.lines.map((line) => <div className="grid grid-cols-[minmax(0,1fr)_80px_140px_140px] gap-3 border-b border-zinc-100 px-4 py-4 text-sm last:border-0" key={`${line.sku}-${line.productName}`}><span><strong className="block">{line.productName}</strong><span className="text-xs text-zinc-500">{line.sku}</span></span><span>{line.quantity}</span><span>{line.unitPrice}</span><span className="font-semibold">{line.lineTotal}</span></div>)}</div>
    <p className="text-xs text-zinc-500">Цены и товарные данные сохранены на момент отправки заказа и доступны только для чтения.</p>
  </div>;
}

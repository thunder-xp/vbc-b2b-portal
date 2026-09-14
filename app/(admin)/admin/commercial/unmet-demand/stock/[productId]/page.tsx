import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdminPagePermission } from "@/src/modules/admin/services/admin-page-guard";
import { getUnmetDemandDetailForAdmin } from "@/src/modules/estimates/actions/demand.actions";

export default async function UnmetDemandProductPage({ params, searchParams }: { params: Promise<{ productId: string }>; searchParams: Promise<{ window?: string; page?: string }> }) {
  await requireAdminPagePermission("admin.external_demand.view");
  const [{ productId }, query] = await Promise.all([params, searchParams]);
  const window = [30, 90, 180].includes(Number(query.window)) ? Number(query.window) : 30;
  const page = Math.max(Number(query.page ?? 1) || 1, 1);
  const detail = await getUnmetDemandDetailForAdmin(productId, window, page);
  if (!detail) notFound();
  return <div className="space-y-5">
    <header><Link className="text-sm font-semibold text-emerald-700" href={`/admin/commercial/unmet-demand?scope=stock&window=${window}`}>← Неудовлетворённый спрос</Link><h1 className="mt-2 text-2xl font-semibold text-zinc-950">{detail.product.sku} · {detail.product.productName}</h1><p className="mt-1 text-sm text-zinc-600">{detail.product.brandName ?? "Без бренда"} · {detail.product.categoryName ?? "Без категории"}</p></header>
    <div className="overflow-x-auto border border-zinc-200 bg-white"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-zinc-50 text-zinc-600"><tr><th className="p-3">Дата</th><th className="p-3">Партнёр</th><th className="p-3">Исходное КП</th><th className="p-3">Запрошено</th><th className="p-3">Доступно</th><th className="p-3">Дефицит</th><th className="p-3">Цена</th><th className="p-3">Причина</th></tr></thead><tbody>{detail.events.map((event) => <tr className="border-t border-zinc-200" key={event.id}><td className="p-3">{date(event.occurredAt)}</td><td className="p-3">{event.companyName}</td><td className="p-3"><span className="font-semibold">{event.estimateNumber}</span><p className="font-mono text-[11px] text-zinc-500">{event.estimateId}</p></td><td className="p-3">{event.requestedQuantity}</td><td className="p-3">{event.availableQuantity}</td><td className="p-3 font-semibold">{event.shortageQuantity}</td><td className="p-3">{price(event.priceAtDemand, event.currencyCode)}</td><td className="p-3">{reason(event.reason)}</td></tr>)}</tbody></table>{!detail.events.length && <p className="p-8 text-center text-sm text-zinc-500">События за выбранный период не найдены.</p>}</div>
  </div>;
}

function date(value: string) { return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function price(value: number | null, currency: string | null) { return value !== null && currency ? new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(value) : "—"; }
function reason(value: string) { return ({ PARTIAL_STOCK: "Частичный остаток", OUT_OF_STOCK: "Нет в наличии", NOT_STOCKED: "Не поддерживается на складе", DISCONTINUED: "Снято с ассортимента" } as Record<string, string>)[value] ?? value; }

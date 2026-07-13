import Link from "next/link";
import { notFound } from "next/navigation";
import { getInternalReservationRequestAction } from "@/src/modules/reservation-requests/actions";
import { InternalReservationReviewPanel, ReservationStatusBadge } from "@/src/modules/reservation-requests/components";

export default async function InternalReservationRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getInternalReservationRequestAction(id);
  if (!result.success) {
    if (result.errorCode === "NOT_FOUND") notFound();
    return <main className="p-8"><p className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">{result.message}</p></main>;
  }
  const request = result.data;
  return <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl space-y-6"><header className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><Link className="text-sm font-semibold text-emerald-700" href="/admin/reservation-requests">← Запросы резервирования</Link><p className="mt-4 text-xs font-semibold uppercase text-zinc-500">{request.companyName}</p><h1 className="mt-1 text-2xl font-semibold">{request.projectName}</h1><p className="mt-1 text-sm text-zinc-600">{request.customerSiteName}</p></div><ReservationStatusBadge status={request.status} /></header><section className="grid gap-4 border border-zinc-200 bg-white p-5 sm:grid-cols-3"><Info label="Дата поставки" value={request.requestedDeliveryDate ?? "—"} /><Info label="Комментарий партнёра" value={request.partnerComment ?? "Нет комментария"} /><Info label="Ответ менеджера" value={request.managerComment ?? "Решение не принято"} /></section><section className="overflow-x-auto border border-zinc-200 bg-white"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Товар</th><th className="px-4 py-3">Запрошено</th><th className="px-4 py-3">Одобрено</th><th className="px-4 py-3">Партнёрская</th><th className="px-4 py-3">Розница</th><th className="px-4 py-3">Текущий остаток</th><th className="px-4 py-3">Ближайшее поступление</th></tr></thead><tbody className="divide-y divide-zinc-100">{request.lines.map((line) => <tr key={line.id}><td className="px-4 py-4"><span className="font-semibold">{line.productName}</span><div className="text-xs text-zinc-500">SKU {line.sku}</div></td><td className="px-4 py-4">{line.requestedQuantity}</td><td className="px-4 py-4">{line.approvedQuantity ?? "—"}</td><td className="px-4 py-4">{line.partnerPrice ?? "Недоступно"}</td><td className="px-4 py-4">{line.retailPrice ?? "Недоступно"}</td><td className="px-4 py-4">{line.availability.availableStock ?? "Уточняется"}</td><td className="px-4 py-4">{line.availability.nearestArrivalDate ?? "—"}{line.availability.nearestArrivalQuantity !== null ? ` · ${line.availability.nearestArrivalQuantity} шт.` : ""}</td></tr>)}</tbody></table></section><InternalReservationReviewPanel request={request} /></div></main>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-semibold uppercase text-zinc-500">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm">{value}</p></div>; }

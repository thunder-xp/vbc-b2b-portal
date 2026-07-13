"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { submitReservationRequestAction, updateReservationQuantityAction, updateReservationRequestAction } from "../actions";
import type { ReservationRequestDetailDto } from "../services";
import { ReservationRequestStatus } from "../types";
import { ReservationStatusBadge } from "./ReservationStatusBadge";

export function ReservationDetail({ request }: { request: ReservationRequestDetailDto }) {
  const draft = request.status === ReservationRequestStatus.Draft;
  return <div className="space-y-6">
    <header className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><Link className="text-sm font-semibold text-emerald-700" href="/cabinet/reservation-requests">← Запросы резервирования</Link><h1 className="mt-2 text-2xl font-semibold">{request.projectName}</h1><p className="mt-1 text-sm text-zinc-500">{request.customerSiteName}</p></div><ReservationStatusBadge status={request.status} /></header>
    {request.managerComment ? <section className="border-l-4 border-emerald-600 bg-emerald-50 p-5"><h2 className="text-sm font-semibold">Ответ Novotech</h2><p className="mt-2 whitespace-pre-wrap text-sm">{request.managerComment}</p></section> : null}
    {draft ? <DraftMetadata request={request} /> : <section className="grid gap-4 border border-zinc-200 bg-white p-5 sm:grid-cols-2"><Info label="Предпочтительная дата" value={request.requestedDeliveryDate ?? "Не указана"} /><Info label="Комментарий партнёра" value={request.partnerComment ?? "Нет комментария"} /></section>}
    <section className="overflow-x-auto border border-zinc-200 bg-white"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Товар</th><th className="px-4 py-3">Запрошено</th><th className="px-4 py-3">Одобрено</th><th className="px-4 py-3">Партнёрская</th><th className="px-4 py-3">Розница</th><th className="px-4 py-3">Наличие</th><th className="px-4 py-3">Поступление</th></tr></thead><tbody className="divide-y divide-zinc-100">{request.lines.map((line) => <tr key={line.id}><td className="px-4 py-4"><Link className="font-semibold hover:text-emerald-700" href={`/cabinet/catalog/${line.slug}`}>{line.productName}</Link><div className="text-xs text-zinc-500">SKU {line.sku} · максимум {line.specificationQuantity}</div></td><td className="px-4 py-4">{draft ? <QuantityEditor itemId={line.id} max={line.specificationQuantity} requestId={request.id} value={line.requestedQuantity} /> : line.requestedQuantity}</td><td className="px-4 py-4">{line.approvedQuantity ?? "—"}</td><td className="px-4 py-4">{line.partnerPrice ?? "Недоступно"}</td><td className="px-4 py-4">{line.retailPrice ?? "Недоступно"}</td><td className="px-4 py-4">{line.availability.availableStock ?? "Уточняется"}</td><td className="px-4 py-4">{line.availability.nearestArrivalDate ?? "—"}{line.availability.nearestArrivalQuantity !== null ? ` · ${line.availability.nearestArrivalQuantity} шт.` : ""}</td></tr>)}</tbody></table></section>
    {draft ? <SubmitRequest requestId={request.id} /> : null}
  </div>;
}

function DraftMetadata({ request }: { request: ReservationRequestDetailDto }) {
  const router = useRouter(); const [message, setMessage] = useState<string | null>(null); const [pending, startTransition] = useTransition();
  return <form className="grid gap-4 border border-zinc-200 bg-white p-5 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); startTransition(async () => { const result = await updateReservationRequestAction(request.id, { requestedDeliveryDate: String(data.get("requestedDeliveryDate") ?? ""), partnerComment: String(data.get("partnerComment") ?? "") }); setMessage(result.message); if (result.success) router.refresh(); }); }}><label className="text-sm font-medium">Предпочтительная дата<input className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3" defaultValue={request.requestedDeliveryDate ?? ""} name="requestedDeliveryDate" required type="date" /></label><label className="text-sm font-medium">Комментарий<textarea className="mt-2 min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2" defaultValue={request.partnerComment ?? ""} maxLength={2000} name="partnerComment" /></label><div className="sm:col-span-2"><button className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={pending} type="submit">Сохранить</button>{message ? <span className="ml-3 text-sm text-zinc-500" role="status">{message}</span> : null}</div></form>;
}

function QuantityEditor({ requestId, itemId, value, max }: { requestId: string; itemId: string; value: number; max: number }) {
  const router = useRouter(); const [pending, startTransition] = useTransition();
  return <input aria-label="Запрошенное количество" className="h-10 w-24 rounded-md border border-zinc-300 px-2" defaultValue={value} disabled={pending} max={max} min={1} onBlur={(event) => { const quantity = Number(event.currentTarget.value); startTransition(async () => { const result = await updateReservationQuantityAction(requestId, itemId, quantity); if (result.success) router.refresh(); }); }} type="number" />;
}

function SubmitRequest({ requestId }: { requestId: string }) {
  const router = useRouter(); const [message, setMessage] = useState<string | null>(null); const [pending, startTransition] = useTransition();
  return <div><button className="rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={pending} onClick={() => startTransition(async () => { const result = await submitReservationRequestAction(requestId); setMessage(result.message); if (result.success) router.refresh(); })} type="button">{pending ? "Отправка..." : "Отправить в Novotech"}</button>{message ? <p className="mt-2 text-sm text-zinc-600" role="status">{message}</p> : null}</div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-semibold uppercase text-zinc-500">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm">{value}</p></div>; }

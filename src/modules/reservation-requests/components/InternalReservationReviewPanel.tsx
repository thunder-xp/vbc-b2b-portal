"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { decideReservationRequestAction, startReservationReviewAction } from "../actions";
import type { InternalReservationDetailDto } from "../services";
import { ReservationRequestStatus } from "../types";

export function InternalReservationReviewPanel({ request }: { request: InternalReservationDetailDto }) {
  const router = useRouter(); const [pending, startTransition] = useTransition(); const [message, setMessage] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>(Object.fromEntries(request.lines.map((line) => [line.id, line.requestedQuantity])));
  if (request.status === ReservationRequestStatus.Submitted) return <section className="border-t border-zinc-200 pt-5"><button className="rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={pending} onClick={() => startTransition(async () => { const result = await startReservationReviewAction(request.id); setMessage(result.message); if (result.success) router.refresh(); })} type="button">Начать рассмотрение</button>{message ? <p className="mt-2 text-sm">{message}</p> : null}</section>;
  if (request.status !== ReservationRequestStatus.UnderReview) return null;
  const decide = (status: ReservationRequestStatus.Approved | ReservationRequestStatus.PartiallyApproved | ReservationRequestStatus.Rejected) => startTransition(async () => {
    const result = await decideReservationRequestAction({ requestId: request.id, status, comment, approvedQuantities: request.lines.map((line) => ({ itemId: line.id, approvedQuantity: quantities[line.id] ?? 0 })) });
    setMessage(result.message); if (result.success) router.refresh();
  });
  return <section className="space-y-4 border-t border-zinc-200 pt-5"><div className="grid gap-3 sm:grid-cols-2">{request.lines.map((line) => <label className="text-sm font-medium" key={line.id}>{line.sku} · {line.productName}<input className="mt-2 h-10 w-full rounded-md border border-zinc-300 px-3" max={line.requestedQuantity} min={0} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: Number(event.target.value) }))} type="number" value={quantities[line.id]} /></label>)}</div><label className="block text-sm font-medium">Ответ партнёру<textarea className="mt-2 min-h-28 w-full rounded-md border border-zinc-300 px-3 py-2" maxLength={2000} onChange={(event) => setComment(event.target.value)} value={comment} /></label><div className="flex flex-wrap gap-2"><button className="rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white" disabled={pending} onClick={() => decide(ReservationRequestStatus.Approved)} type="button">Одобрить полностью</button><button className="rounded-md border border-amber-400 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900" disabled={pending} onClick={() => decide(ReservationRequestStatus.PartiallyApproved)} type="button">Одобрить частично</button><button className="rounded-md border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800" disabled={pending || !comment.trim()} onClick={() => decide(ReservationRequestStatus.Rejected)} type="button">Отклонить</button></div>{message ? <p className="text-sm text-zinc-600" role="status">{message}</p> : null}</section>;
}

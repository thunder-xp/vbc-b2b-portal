"use client";

import { useState, useTransition } from "react";

import { curateExternalNomenclatureAction, transitionExternalDemandAction } from "../actions/demand.actions";
import type { ExternalDemandDetail, ExternalDemandRequestDetail } from "../types";

export function ExternalDemandAdminControls({ detail, products }: { detail: ExternalDemandDetail; products: Array<{ id: string; sku: string; name: string }> }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return <div className="space-y-5">
    {message && <p aria-live="polite" className="border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm text-zinc-700">{message}</p>}
    <div className="space-y-3">
      {detail.requests.map((request) => <RequestControl detailId={detail.item.externalItemId} key={request.id} onMessage={setMessage} pending={pending} products={products} request={request} startTransition={startTransition} />)}
      {!detail.requests.length && <p className="py-8 text-center text-sm text-zinc-500">Активных запросов Novotech нет.</p>}
    </div>
    {detail.possibleDuplicates.length > 0 && <section className="border-t border-zinc-200 pt-5">
      <h2 className="font-semibold text-zinc-950">Возможные дубликаты</h2>
      <p className="mt-1 text-sm text-zinc-500">Связь создаётся только после явного внутреннего решения. Исторические строки смет сохраняются.</p>
      <div className="mt-3 space-y-2">{detail.possibleDuplicates.map((candidate) => <form className="grid gap-2 border border-zinc-200 p-3 md:grid-cols-[minmax(0,1fr)_minmax(14rem,1fr)_auto] md:items-end" key={candidate.id} onSubmit={(event) => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        startTransition(async () => { const result = await curateExternalNomenclatureAction({ sourceItemId: candidate.id, canonicalItemId: detail.item.externalItemId, reason: String(data.get("reason") ?? "") }); setMessage(result.message); });
      }}>
        <p className="text-sm"><strong>{candidate.manufacturer} {candidate.model}</strong><span className="block text-zinc-500">{candidate.name}</span></p>
        <label className="text-xs font-medium text-zinc-600">Причина<input className="mt-1 h-10 w-full border border-zinc-300 px-3 text-sm" minLength={10} name="reason" required /></label>
        <button className="min-h-11 border border-zinc-300 px-4 text-sm font-semibold disabled:opacity-50" disabled={pending} type="submit">Сделать дубликатом</button>
      </form>)}</div>
    </section>}
  </div>;
}

function RequestControl({ detailId, request, products, pending, startTransition, onMessage }: {
  detailId: string; request: ExternalDemandRequestDetail; products: Array<{ id: string; sku: string; name: string }>; pending: boolean;
  startTransition: ReturnType<typeof useTransition>[1]; onMessage: (message: string) => void;
}) {
  const transitions = request.status === "new" ? ["reviewing", "closed"] : request.status === "reviewing" ? ["solution_proposed", "closed"] : request.status === "solution_proposed" ? ["reviewing", "closed"] : [];
  return <form className="grid gap-3 border border-zinc-200 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_12rem_14rem_14rem_auto] lg:items-end" onSubmit={(event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    startTransition(async () => { const result = await transitionExternalDemandAction({ externalItemId: detailId, requestId: request.id, expectedVersion: request.version, status: String(data.get("status")), responseType: String(data.get("responseType") || "") || undefined, catalogProductId: String(data.get("catalogProductId") || "") || undefined }); onMessage(result.message); });
  }}>
    <div className="text-sm"><p className="font-semibold text-zinc-950">{request.companyName} · {request.estimateNumber}</p><p className="mt-1 text-zinc-600">{request.customerName || "Заказчик не указан"} · {request.projectName || "Проект не указан"}</p><p className="mt-1 text-xs text-zinc-500">{request.quantity} {request.unit} · {request.locality || "Регион не указан"} · {request.industryCode || "Отрасль не указана"}</p></div>
    {transitions.length ? <><label className="text-xs font-medium text-zinc-600">Новый статус<select className="mt-1 h-10 w-full border border-zinc-300 bg-white px-2 text-sm" name="status">{transitions.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
      <label className="text-xs font-medium text-zinc-600">Ответ<select className="mt-1 h-10 w-full border border-zinc-300 bg-white px-2 text-sm" defaultValue="" name="responseType"><option value="">Без нового ответа</option><option value="catalog_product">Товар Novotech</option><option value="governed_alternative">Согласованная альтернатива</option><option value="sourcing_review">Проверка поставки</option><option value="cannot_supply">Не можем поставить</option></select></label>
      <label className="text-xs font-medium text-zinc-600">Товар<select className="mt-1 h-10 w-full border border-zinc-300 bg-white px-2 text-sm" defaultValue="" name="catalogProductId"><option value="">Не выбран</option>{products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></label>
      <button className="min-h-11 bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={pending} type="submit">Сохранить</button></> : <p className="text-sm font-medium text-zinc-600">{statusLabel(request.status ?? "closed")}</p>}
  </form>;
}

function statusLabel(status: string) { return ({ new: "Новый", reviewing: "На рассмотрении", solution_proposed: "Решение предложено", closed: "Закрыт", cancelled: "Отменён" } as Record<string, string>)[status] ?? status; }

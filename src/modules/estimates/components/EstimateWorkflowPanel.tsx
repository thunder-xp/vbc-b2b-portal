"use client";

import { CheckCircle2, Copy, Download, Send, ShoppingCart, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import { ConfirmationDialog } from "../../platform-ui";
import {
  addEstimateEquipmentToCartAction,
  duplicateEstimateAction,
  markEstimateReadyAction,
  saveEstimateAsTemplateAction,
  transitionEstimateVersionAction,
} from "../actions/lifecycle.actions";
import { generateEstimateVersionPdfAction } from "../actions/proposal.actions";
import type { EstimateRejectionReason, EstimateWorkflowDto } from "../types";
import { SendProposalDialog } from "./SendProposalDialog";
import { EstimateStatusBadge } from "./EstimateStatusBadge";

export function EstimateWorkflowPanel({ initialWorkflow, revision }: { initialWorkflow: EstimateWorkflowDto; revision: number }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<EstimateRejectionReason | "">("");
  const [conversionOpen, setConversionOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const proposal = initialWorkflow.versions.find((item) => item.id === initialWorkflow.acceptedVersionId) ?? initialWorkflow.versions[0] ?? null;
  const run = (operation: () => Promise<{ success: boolean; message: string }>, after?: () => void) => startTransition(async () => {
    const result = await operation();
    setMessage(result.message);
    if (result.success) { after?.(); router.refresh(); }
  });
  const duplicate = () => startTransition(async () => {
    const result = await duplicateEstimateAction(initialWorkflow.estimateId);
    setMessage(result.message);
    if (result.success) router.push(`/cabinet/estimates/${result.data.estimateId}`);
  });
  const addToCart = () => startTransition(async () => {
    const result = await addEstimateEquipmentToCartAction(initialWorkflow.estimateId, proposal?.id ?? null, crypto.randomUUID());
    if (!result.success) return setMessage(result.message);
    setMessage(`${result.message} Добавлено: ${result.data.added}, обновлено: ${result.data.updated}, цена изменилась: ${result.data.changedPrice}, недоступно: ${result.data.unavailable + result.data.inactive}, без цены: ${result.data.missingPrice}, пропущено: ${result.data.skipped}.`);
  });

  return <section className="space-y-4 border-y border-zinc-200 bg-white px-4 py-5 sm:px-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold uppercase text-emerald-700">Коммерческое предложение</p><EstimateStatusBadge status={initialWorkflow.lifecycleStatus} /></div><h2 className="mt-1 text-lg font-semibold">Отправка и статус</h2>{initialWorkflow.lifecycleStatus === "sent" && initialWorkflow.lifecycleExpiresAt ? <p className="mt-1 text-xs text-zinc-500">Действительно до {formatDate(initialWorkflow.lifecycleExpiresAt)}</p> : null}</div>
      <div className="flex flex-wrap gap-2">
        {initialWorkflow.estimateStatus === "draft" && <button className={secondary} disabled={pending || !initialWorkflow.readiness.ready} onClick={() => run(() => markEstimateReadyAction(initialWorkflow.estimateId, revision))} type="button"><CheckCircle2 className="size-4" />Отметить как готово</button>}
        <button className={secondary} disabled={pending} onClick={duplicate} type="button"><Copy className="size-4" />Дублировать</button>
        <TemplateButton estimateId={initialWorkflow.estimateId} pending={pending} setMessage={setMessage} startTransition={startTransition} />
      </div>
    </header>

    {message && <p aria-live="polite" className="border-l-4 border-emerald-600 bg-emerald-50 px-3 py-2 text-sm">{message}</p>}
    {!proposal ? <p className="py-3 text-sm text-zinc-500">Сохраните расчёт и подготовьте коммерческое предложение в блоке итогов.</p> : <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-4">
      <Link className={secondary} href={`/cabinet/estimates/${initialWorkflow.estimateId}/versions/${proposal.id}/preview`} prefetch={false}>Предпросмотр</Link>
      {proposal.pdfStatus !== "ready" ? <button className={secondary} disabled={pending} onClick={() => run(() => generateEstimateVersionPdfAction(proposal.id), () => recordBehaviorInteraction({ eventName: "proposal_pdf_generated", route: "/cabinet/estimates/detail", sourceSurface: "proposal_workflow" }))} type="button"><Download className="size-4" />Сформировать PDF</button> : null}
      {proposal.pdfDocumentId && proposal.pdfStatus === "ready" ? <Link className={secondary} href={`/api/estimates/documents/${proposal.pdfDocumentId}`}><Download className="size-4" />Скачать PDF</Link> : null}
      <SendProposalDialog canSend={initialWorkflow.emailDeliveryAvailable && (proposal.status === "prepared" || proposal.status === "sent") && proposal.pdfStatus === "ready"} defaults={proposal.deliveryDefaults} deliveries={proposal.deliveries} emailAvailable={initialWorkflow.emailDeliveryAvailable} pdfReady={proposal.pdfStatus === "ready"} versionId={proposal.id} versionLabel="Коммерческое предложение" />
      {proposal.status === "prepared" && proposal.pdfStatus === "ready" && initialWorkflow.lifecycleStatus === "draft" ? <button className={secondary} disabled={pending} onClick={() => run(() => transitionEstimateVersionAction(proposal.id, "sent", "other"))} type="button"><Send className="size-4" />Отправлено заказчику</button> : null}
      {proposal.status === "sent" && initialWorkflow.lifecycleStatus === "sent" ? <><button className={primary} disabled={pending} onClick={() => run(() => transitionEstimateVersionAction(proposal.id, "accepted"))} type="button"><CheckCircle2 className="size-4" />Принято заказчиком</button><label className="sr-only" htmlFor="estimate-rejection-reason">Причина отклонения</label><select className={`${input} w-auto min-w-44`} id="estimate-rejection-reason" onChange={(event) => setRejectionReason(event.target.value as typeof rejectionReason)} value={rejectionReason}><option value="">Причина отклонения</option><option value="price">Цена</option><option value="no_budget">Нет бюджета</option><option value="other_supplier">Выбран другой поставщик</option><option value="project_changed">Изменился проект</option><option value="postponed">Отложено</option><option value="other">Другое</option></select><button className={secondary} disabled={pending || !rejectionReason} onClick={() => run(() => transitionEstimateVersionAction(proposal.id, "rejected", null, "", rejectionReason || undefined))} type="button"><XCircle className="size-4" />Отклонено</button></> : null}
      {proposal.status === "accepted" ? <button className={primary} disabled={pending} onClick={() => setConversionOpen(true)} type="button"><ShoppingCart className="size-4" />Создать заказ</button> : <button className={secondary} disabled={pending} onClick={() => setConversionOpen(true)} type="button"><ShoppingCart className="size-4" />Проверить для заказа</button>}
    </div>}
    <ConfirmationDialog confirmLabel="Добавить оборудование в корзину" consequence="В корзину попадут только позиции оборудования. Услуги и ручные позиции останутся в смете." open={conversionOpen} onCancel={() => setConversionOpen(false)} onConfirm={() => { setConversionOpen(false); addToCart(); }} pending={pending} title="Создание заказа"><p className="text-sm text-zinc-700">Перед добавлением сервер проверит актуальные цены и доступность. Заказ в 1С на этом шаге не создаётся.</p></ConfirmationDialog>
  </section>;
}

function TemplateButton({ estimateId, pending, setMessage, startTransition }: { estimateId: string; pending: boolean; setMessage: (message: string) => void; startTransition: ReturnType<typeof useTransition>[1] }) {
  const [name, setName] = useState("");
  return <details className="relative"><summary className={`${secondary} cursor-pointer list-none`}>Сохранить как шаблон</summary><div className="absolute right-0 z-10 mt-2 w-72 border border-zinc-200 bg-white p-3 shadow-lg"><label className="text-xs font-medium">Название<input className={`${input} mt-1`} maxLength={120} onChange={(event) => setName(event.target.value)} value={name} /></label><button className={`${primary} mt-3 w-full`} disabled={pending || !name.trim()} onClick={() => startTransition(async () => { const result = await saveEstimateAsTemplateAction(estimateId, name); setMessage(result.message); if (result.success) setName(""); })} type="button">Сохранить</button></div></details>;
}

function formatDate(value: string) { return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
const input = "min-h-11 w-full border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-45";
const secondary = "inline-flex min-h-11 items-center justify-center gap-2 border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 disabled:opacity-45";

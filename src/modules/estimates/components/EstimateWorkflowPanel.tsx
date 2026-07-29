"use client";

import { CheckCircle2, Copy, Download, FileClock, FilePlus2, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import { ConfirmationDialog } from "../../platform-ui";
import {
  addEstimateEquipmentToCartAction,
  createDraftFromEstimateVersionAction,
  createEstimateVersionAction,
  duplicateEstimateAction,
  markEstimateReadyAction,
  saveEstimateAsTemplateAction,
} from "../actions/lifecycle.actions";
import { generateEstimateVersionPdfAction } from "../actions/proposal.actions";
import type { EstimateWorkflowDto } from "../types";
import { SendProposalDialog } from "./SendProposalDialog";

export function EstimateWorkflowPanel({ initialWorkflow, revision }: { initialWorkflow: EstimateWorkflowDto; revision: number }) {
  const router = useRouter();
  const [workflow, setWorkflow] = useState(initialWorkflow);
  const [message, setMessage] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [conversionVersionId, setConversionVersionId] = useState<string | null | undefined>(undefined);
  const [pending, startTransition] = useTransition();
  const run = (operation: () => Promise<{ success: boolean; message: string }>, after?: () => void) => startTransition(async () => {
    const result = await operation();
    setMessage(result.message);
    if (result.success) { after?.(); router.refresh(); }
  });
  const addToCart = (versionId: string | null) => startTransition(async () => {
    const result = await addEstimateEquipmentToCartAction(workflow.estimateId, versionId, crypto.randomUUID());
    if (!result.success) return setMessage(result.message);
    recordBehaviorInteraction({ eventName: "proposal_converted_to_order", route: "/cabinet/estimates/detail", sourceSurface: "proposal_workflow" });
    setMessage(`${result.message} Добавлено: ${result.data.added}, обновлено: ${result.data.updated}, цена изменилась: ${result.data.changedPrice}, недоступно: ${result.data.unavailable + result.data.inactive}, без цены: ${result.data.missingPrice}, пропущено: ${result.data.skipped}.`);
  });
  const duplicate = () => startTransition(async () => {
    const result = await duplicateEstimateAction(workflow.estimateId);
    setMessage(result.message);
    if (result.success) router.push(`/cabinet/estimates/${result.data.estimateId}`);
  });
  const restoreVersion = (versionId: string) => startTransition(async () => {
    const result = await createDraftFromEstimateVersionAction(versionId);
    setMessage(result.message);
    if (result.success) router.push(`/cabinet/estimates/${result.data.estimateId}`);
  });

  return <section className="space-y-4 border-y border-zinc-200 bg-white px-4 py-5 sm:px-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase text-emerald-700">Коммерческое предложение</p><h2 className="mt-1 text-lg font-semibold">Версии предложения</h2><p className="mt-1 text-sm text-zinc-500">Каждая версия фиксирует цены, состав и условия. Отправленные и принятые версии неизменяемы; для правок создайте новую версию.</p></div>
      <div className="flex flex-wrap gap-2">
        {workflow.estimateStatus === "draft" && <button className={secondary} disabled={pending || !workflow.readiness.ready} onClick={() => run(() => markEstimateReadyAction(workflow.estimateId, revision))} type="button"><CheckCircle2 className="size-4" />Отметить как готово</button>}
        <button className={secondary} disabled={pending} onClick={duplicate} type="button"><Copy className="size-4" />Дублировать</button>
        <button className={secondary} disabled={pending} onClick={() => setConversionVersionId(null)} type="button"><ShoppingCart className="size-4" />Проверить для заказа</button>
      </div>
    </header>

    {!workflow.readiness.ready && <div className="bg-amber-50 px-3 py-3 text-sm text-amber-950"><p className="font-semibold">Перед созданием версии:</p><ul className="mt-1 grid gap-1 sm:grid-cols-2">{workflow.readiness.checks.filter((check) => !check.passed).map((check) => <li key={check.label}>• {check.label}</li>)}</ul></div>}
    {message && <p aria-live="polite" className="border-l-4 border-emerald-600 bg-emerald-50 px-3 py-2 text-sm">{message}</p>}

    <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto_auto]">
      <input aria-label="Комментарий к версии" className={input} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="Комментарий к версии (необязательно)" value={note} />
      <button className={primary} disabled={pending || !workflow.readiness.ready} onClick={() => startTransition(async () => {
        const result = await createEstimateVersionAction(workflow.estimateId, revision, note);
        setMessage(result.message);
        if (result.success) {
          recordBehaviorInteraction({ eventName: workflow.versions.length ? "proposal_version_created" : "proposal_created", route: "/cabinet/estimates/detail", sourceSurface: "proposal_workflow" });
          setWorkflow((current) => ({ ...current, versions: [{
            id: result.data.id, versionNumber: result.data.versionNumber, label: `${result.data.estimateNumber} / версия ${result.data.versionNumber}`,
            status: result.data.status, statusLabel: "Подготовлено", total: new Intl.NumberFormat("ru-RU", { style: "currency", currency: result.data.currencyCode }).format(result.data.totalAmount),
            currencyCode: result.data.currencyCode, note: result.data.note, createdAt: result.data.createdAt, createdByName: result.data.createdByName ?? "Пользователь компании", sentAt: null, acceptedAt: null, rejectedAt: null, pdfDocumentId: null, pdfStatus: null, deliveries: [],
          }, ...current.versions] }));
          setNote("");
        }
      })} type="button"><FilePlus2 className="size-4" />Подготовить коммерческое предложение</button>
      <TemplateButton estimateId={workflow.estimateId} pending={pending} setMessage={setMessage} startTransition={startTransition} />
    </div>

    <div className="divide-y divide-zinc-200 border-t border-zinc-200">
      {workflow.versions.length ? workflow.versions.map((version) => <article className="grid gap-3 py-4 lg:grid-cols-[minmax(13rem,1fr)_9rem_minmax(18rem,auto)] lg:items-center" key={version.id}>
        <div><div className="flex flex-wrap items-center gap-2"><Link className="font-semibold text-zinc-950 hover:text-emerald-700" href={`/cabinet/estimates/${workflow.estimateId}/versions/${version.id}/preview`}>{version.label}</Link><VersionBadge status={version.status} /><span className="text-xs text-zinc-500">Зафиксированная версия</span></div><p className="mt-1 text-xs text-zinc-500">{formatDate(version.createdAt)} · {version.createdByName}{version.note ? ` · ${version.note}` : ""}</p></div>
        <div><p className="font-semibold">{version.total}</p><p className="text-xs text-zinc-500">PDF: {version.pdfStatus ? pdfLabel(version.pdfStatus) : "не сформирован"}</p>{version.sentAt ? <p className="mt-1 text-xs text-zinc-500">Отправлено {formatDate(version.sentAt)}</p> : null}</div>
        <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
          <Link className={iconButton} href={`/cabinet/estimates/${workflow.estimateId}/versions/${version.id}/preview`}><FileClock className="size-4" />Предпросмотр</Link>
          {version.pdfStatus !== "ready" && <button className={iconButton} disabled={pending} onClick={() => run(() => generateEstimateVersionPdfAction(version.id), () => recordBehaviorInteraction({ eventName: "proposal_pdf_generated", route: "/cabinet/estimates/detail", sourceSurface: "proposal_workflow" }))} type="button"><Download className="size-4" />Сформировать PDF</button>}
          {version.pdfDocumentId && version.pdfStatus === "ready" && <Link className={iconButton} href={`/api/estimates/documents/${version.pdfDocumentId}`}><Download className="size-4" />Скачать PDF</Link>}
          <SendProposalDialog canSend={workflow.emailDeliveryAvailable && (version.status === "prepared" || version.status === "sent") && version.pdfStatus === "ready"} defaults={version.deliveryDefaults} deliveries={version.deliveries} emailAvailable={workflow.emailDeliveryAvailable} pdfReady={version.pdfStatus === "ready"} versionId={version.id} versionLabel={version.label} />
          {(version.status === "rejected" || version.status === "accepted") && <button className={secondary} disabled={pending} onClick={() => restoreVersion(version.id)} type="button"><FilePlus2 className="size-4" />Создать новую версию</button>}
          {version.status === "accepted" && <button className={primary} disabled={pending} onClick={() => setConversionVersionId(version.id)} type="button"><ShoppingCart className="size-4" />Создать заказ</button>}
        </div>
      </article>) : <p className="py-8 text-center text-sm text-zinc-500">Версий пока нет. Сохраните смету и создайте первую коммерческую версию.</p>}
    </div>
    <ConfirmationDialog
      confirmLabel="Добавить оборудование в корзину"
      consequence="В корзину попадут только позиции оборудования. Услуги и ручные позиции останутся в смете."
      open={conversionVersionId !== undefined}
      onCancel={() => setConversionVersionId(undefined)}
      onConfirm={() => {
        const versionId = conversionVersionId ?? null;
        setConversionVersionId(undefined);
        addToCart(versionId);
      }}
      pending={pending}
      title="Создание заказа"
    ><div className="space-y-3 text-sm text-zinc-700"><p className="font-medium text-zinc-950">{conversionVersionId ? workflow.versions.find((version) => version.id === conversionVersionId)?.label ?? "Принятая версия" : "Текущая смета"}</p><p>Перед добавлением сервер проверит актуальные цены и доступность. Изменения будут показаны в результате, заказ в 1С на этом шаге не создаётся.</p></div></ConfirmationDialog>
  </section>;
}

function TemplateButton({ estimateId, pending, setMessage, startTransition }: { estimateId: string; pending: boolean; setMessage: (message: string) => void; startTransition: ReturnType<typeof useTransition>[1] }) {
  const [name, setName] = useState("");
  return <details className="relative"><summary className={`${secondary} cursor-pointer list-none`}>Сохранить как шаблон</summary><div className="absolute right-0 z-10 mt-2 w-72 border border-zinc-200 bg-white p-3 shadow-lg"><label className="text-xs font-medium">Название<input className={`${input} mt-1`} maxLength={120} onChange={(event) => setName(event.target.value)} value={name} /></label><button className={`${primary} mt-3 w-full`} disabled={pending || !name.trim()} onClick={() => startTransition(async () => { const result = await saveEstimateAsTemplateAction(estimateId, name); setMessage(result.message); if (result.success) setName(""); })} type="button">Сохранить</button></div></details>;
}

function VersionBadge({ status }: { status: EstimateWorkflowDto["versions"][number]["status"] }) { const label = ({ prepared: "Подготовлено", sent: "Отправлено", accepted: "Принято", rejected: "Отклонено", archived: "Архивировано" } as const)[status]; const tone = status === "accepted" ? "bg-emerald-100 text-emerald-800" : status === "rejected" ? "bg-red-100 text-red-800" : status === "sent" ? "bg-blue-100 text-blue-800" : "bg-zinc-100 text-zinc-700"; return <span className={`px-2 py-1 text-xs font-semibold ${tone}`}>{label}</span>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function pdfLabel(status: NonNullable<EstimateWorkflowDto["versions"][number]["pdfStatus"]>) { return ({ queued: "в очереди", generating: "формируется", ready: "готов", failed: "ошибка" } as const)[status]; }
const input = "min-h-11 w-full border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-45";
const secondary = "inline-flex min-h-11 items-center justify-center gap-2 border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 disabled:opacity-45";
const iconButton = "inline-flex min-h-11 items-center justify-center gap-2 border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700";

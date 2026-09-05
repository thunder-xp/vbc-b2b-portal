"use client";

import { CheckCircle2, Copy, Download, Send, ShoppingCart, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import { ConfirmationDialog } from "../../platform-ui";
import {
  addEstimateEquipmentToCartAction,
  createDraftFromEstimateVersionAction,
  duplicateEstimateAction,
  markEstimateReadyAction,
  saveEstimateAsTemplateAction,
  transitionEstimateVersionAction,
} from "../actions/lifecycle.actions";
import { generateEstimateVersionPdfAction } from "../actions/proposal.actions";
import type { EstimateRejectionReason, EstimateWorkflowDto, GeneratedEstimateDocument } from "../types";
import { SendProposalDialog } from "./SendProposalDialog";
import { EstimateStatusBadge } from "./EstimateStatusBadge";
import { notifyEstimatePdfReady } from "./EstimatePdfShareAction";
import { formatPartnerDateTime, getEstimatesCopy, usePartnerLocale, type EstimatesCopy } from "../../partner-locale";

export function EstimateWorkflowPanel({ initialWorkflow, revision, initialProposalAction }: {
  initialWorkflow: EstimateWorkflowDto;
  revision: number;
  initialProposalAction?: { kind: "resend"; versionId: string } | null;
}) {
  const locale = usePartnerLocale();
  const copy = getEstimatesCopy(locale);
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<EstimateRejectionReason | "">("");
  const [conversionOpen, setConversionOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [pdfPending, startPdfTransition] = useTransition();
  const proposal = initialWorkflow.versions.find((item) => item.id === initialWorkflow.acceptedVersionId) ?? initialWorkflow.versions[0] ?? null;
  const [generatedDocument, setGeneratedDocument] = useState<GeneratedEstimateDocument | null>(null);
  const pdfStatus = generatedDocument?.status ?? proposal?.pdfStatus ?? null;
  const pdfDocumentId = generatedDocument?.id ?? proposal?.pdfDocumentId ?? null;
  const proposalExpired = initialWorkflow.lifecycleStatus === "expired";
  const run = (operation: () => Promise<{ success: boolean; message: string }>, after?: () => void) => startTransition(async () => {
    const result = await operation();
    setMessage(result.success ? copy.operationSucceeded : copy.operationFailed);
    if (result.success) { after?.(); router.refresh(); }
  });
  const duplicate = () => startTransition(async () => {
    const result = await duplicateEstimateAction(initialWorkflow.estimateId);
    setMessage(result.success ? copy.operationSucceeded : copy.operationFailed);
    if (result.success) router.push(`/cabinet/estimates/${result.data.estimateId}`);
  });
  const addToCart = () => startTransition(async () => {
    const requestKey = proposal?.id ?? crypto.randomUUID();
    const result = await addEstimateEquipmentToCartAction(initialWorkflow.estimateId, proposal?.id ?? null, requestKey);
    if (!result.success) return setMessage(copy.operationFailed);
    setMessage(copy.cartResult.replace("{added}", String(result.data.added)).replace("{updated}", String(result.data.updated)).replace("{changed}", String(result.data.changedPrice)).replace("{unavailable}", String(result.data.unavailable + result.data.inactive)).replace("{missing}", String(result.data.missingPrice)).replace("{skipped}", String(result.data.skipped)));
  });
  const generatePdf = () => {
    if (!proposal || pdfPending) return;
    startPdfTransition(async () => {
      const result = await generateEstimateVersionPdfAction(proposal.id);
      if (!result.success) {
        setMessage(copy.operationFailed);
        return;
      }
      setGeneratedDocument(result.data);
      notifyEstimatePdfReady(result.data);
      setMessage(copy.pdfReady);
      recordBehaviorInteraction({ eventName: "proposal_pdf_generated", route: "/cabinet/estimates/detail", sourceSurface: "proposal_workflow" });
    });
  };

  return <section className="scroll-mt-24 space-y-4 border-y border-zinc-200 bg-white px-4 py-5 sm:px-5" id="estimate-order-conversion">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold uppercase text-emerald-700">{copy.commercialProposal}</p><EstimateStatusBadge locale={locale} status={initialWorkflow.lifecycleStatus} /></div><h2 className="mt-1 text-lg font-semibold">{copy.sendingAndStatus}</h2>{initialWorkflow.lifecycleStatus === "sent" && initialWorkflow.lifecycleExpiresAt ? <p className="mt-1 text-xs text-zinc-500">{copy.validUntil} {formatPartnerDateTime(initialWorkflow.lifecycleExpiresAt, locale)}</p> : null}</div>
      <div className="flex flex-wrap gap-2">
        {initialWorkflow.estimateStatus === "draft" && <button className={secondary} disabled={pending || !initialWorkflow.readiness.ready} onClick={() => run(() => markEstimateReadyAction(initialWorkflow.estimateId, revision))} type="button"><CheckCircle2 className="size-4" />{copy.markReady}</button>}
        <button className={secondary} disabled={pending} onClick={duplicate} type="button"><Copy className="size-4" />{copy.duplicateEstimate}</button>
        <TemplateButton copy={copy} estimateId={initialWorkflow.estimateId} pending={pending} setMessage={setMessage} startTransition={startTransition} />
      </div>
    </header>

    {message && <p aria-live="polite" className="border-l-4 border-emerald-600 bg-emerald-50 px-3 py-2 text-sm">{message}</p>}
    {!proposal ? <p className="py-3 text-sm text-zinc-500">{copy.saveCalculationFirst}</p> : <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-4">
      <Link className={secondary} href={`/cabinet/estimates/${initialWorkflow.estimateId}/versions/${proposal.id}/preview`} prefetch={false}>{copy.preview}</Link>
      {pdfStatus !== "ready" ? <button aria-describedby={pdfPending ? "estimate-pdf-progress" : undefined} className={secondary} disabled={pdfPending} onClick={generatePdf} type="button"><Download className="size-4" />{pdfPending ? copy.preparing : copy.generatePdf}</button> : null}
      {pdfPending ? <span aria-live="polite" className="text-sm text-zinc-600" id="estimate-pdf-progress" role="status">{copy.preparing}</span> : null}
      {pdfDocumentId && pdfStatus === "ready" ? <Link className={secondary} href={`/api/estimates/documents/${pdfDocumentId}`}><Download className="size-4" />{copy.downloadPdf}</Link> : null}
      <SendProposalDialog canSend={!proposalExpired && initialWorkflow.emailDeliveryAvailable && (proposal.status === "prepared" || proposal.status === "sent") && pdfStatus === "ready"} defaults={proposal.deliveryDefaults} deliveries={proposal.deliveries} emailAvailable={initialWorkflow.emailDeliveryAvailable} initialOpen={initialProposalAction?.kind === "resend" && initialProposalAction.versionId === proposal.id} pdfReady={pdfStatus === "ready"} versionId={proposal.id} versionLabel={copy.commercialProposal} />
      {proposal.status === "sent" && proposalExpired ? <button className={primary} disabled={pending} onClick={() => run(() => createDraftFromEstimateVersionAction(proposal.id))} type="button">{copy.updateProposal}</button> : null}
      {proposal.status === "prepared" && pdfStatus === "ready" && initialWorkflow.lifecycleStatus === "draft" ? <button className={secondary} disabled={pending} onClick={() => run(() => transitionEstimateVersionAction(proposal.id, "sent", "other"))} type="button"><Send className="size-4" />{copy.sentToCustomer}</button> : null}
      {proposal.status === "sent" && initialWorkflow.lifecycleStatus === "sent" ? <><button className={primary} disabled={pending} onClick={() => run(() => transitionEstimateVersionAction(proposal.id, "accepted"))} type="button"><CheckCircle2 className="size-4" />{copy.acceptedByCustomerAction}</button><label className="sr-only" htmlFor="estimate-rejection-reason">{copy.rejectionReason}</label><select className={`${input} w-auto min-w-44`} id="estimate-rejection-reason" onChange={(event) => setRejectionReason(event.target.value as typeof rejectionReason)} value={rejectionReason}><option value="">{copy.rejectionReason}</option><option value="price">{copy.rejectionPrice}</option><option value="no_budget">{copy.rejectionNoBudget}</option><option value="other_supplier">{copy.rejectionOtherSupplier}</option><option value="project_changed">{copy.rejectionProjectChanged}</option><option value="postponed">{copy.rejectionPostponed}</option><option value="other">{copy.rejectionOther}</option></select><button className={secondary} disabled={pending || !rejectionReason} onClick={() => run(() => transitionEstimateVersionAction(proposal.id, "rejected", null, "", rejectionReason || undefined))} type="button"><XCircle className="size-4" />{copy.rejectedAction}</button></> : null}
      {proposal.status === "accepted" ? <button className={primary} disabled={pending} onClick={() => setConversionOpen(true)} type="button"><ShoppingCart className="size-4" />{copy.continueOrder}</button> : <button className={secondary} disabled={pending} onClick={() => setConversionOpen(true)} type="button"><ShoppingCart className="size-4" />{copy.checkForOrder}</button>}
    </div>}
    <ConfirmationDialog confirmLabel={copy.addEquipmentToCart} consequence={copy.cartConversionConsequence} open={conversionOpen} onCancel={() => setConversionOpen(false)} onConfirm={() => { setConversionOpen(false); addToCart(); }} pending={pending} title={copy.orderCreation}><p className="text-sm text-zinc-700">{copy.cartConversionHint}</p></ConfirmationDialog>
  </section>;
}

function TemplateButton({ copy, estimateId, pending, setMessage, startTransition }: { copy: EstimatesCopy; estimateId: string; pending: boolean; setMessage: (message: string) => void; startTransition: ReturnType<typeof useTransition>[1] }) {
  const [name, setName] = useState("");
  return <details className="relative"><summary className={`${secondary} cursor-pointer list-none`}>{copy.saveAsTemplate}</summary><div className="absolute right-0 z-10 mt-2 w-72 border border-zinc-200 bg-white p-3 shadow-lg"><label className="text-xs font-medium">{copy.templateName}<input className={`${input} mt-1`} maxLength={120} onChange={(event) => setName(event.target.value)} value={name} /></label><button className={`${primary} mt-3 w-full`} disabled={pending || !name.trim()} onClick={() => startTransition(async () => { const result = await saveEstimateAsTemplateAction(estimateId, name); setMessage(result.success ? copy.operationSucceeded : copy.operationFailed); if (result.success) setName(""); })} type="button">{copy.save}</button></div></details>;
}
const input = "min-h-11 w-full border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-45";
const secondary = "inline-flex min-h-11 items-center justify-center gap-2 border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 disabled:opacity-45";

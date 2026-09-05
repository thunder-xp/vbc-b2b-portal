"use client";

import { CheckCircle2, Copy, Download, Send, ShoppingCart, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import { formatPartnerDateTime, getEstimatesCopy, usePartnerLocale, type EstimatesCopy } from "../../partner-locale";
import { ConfirmationDialog } from "../../platform-ui";
import { revokeProposalDeliveryAction } from "../actions/delivery.actions";
import {
  addEstimateEquipmentToCartAction,
  createDraftFromEstimateVersionAction,
  duplicateEstimateAction,
  markEstimateReadyAction,
  saveEstimateAsTemplateAction,
  transitionEstimateVersionAction,
} from "../actions/lifecycle.actions";
import { generateEstimateVersionPdfAction } from "../actions/proposal.actions";
import type {
  EstimateGuidedState,
  EstimateRejectionReason,
  EstimateWorkflowDto,
  GeneratedEstimateDocument,
  ProposalDeliverySummaryDto,
} from "../types";
import { ESTIMATE_DIRTY_STATE_EVENT, type EstimateDirtyStateDetail } from "./estimate-client-events";
import { notifyEstimatePdfReady } from "./EstimatePdfShareAction";
import { SendProposalDialog } from "./SendProposalDialog";

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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [pending, startTransition] = useTransition();
  const [pdfPending, startPdfTransition] = useTransition();
  const proposal = initialWorkflow.versions.find((item) => item.id === initialWorkflow.acceptedVersionId) ?? initialWorkflow.versions[0] ?? null;
  const [generatedDocument, setGeneratedDocument] = useState<GeneratedEstimateDocument | null>(null);
  const pdfStatus = generatedDocument?.status ?? proposal?.pdfStatus ?? null;
  const pdfDocumentId = generatedDocument?.id ?? proposal?.pdfDocumentId ?? null;
  const guided = initialWorkflow.guidedState;
  const latestDelivery = proposal?.deliveries[0] ?? null;

  useEffect(() => {
    const receiveDirtyState = (event: Event) => {
      const detail = (event as CustomEvent<EstimateDirtyStateDetail>).detail;
      if (detail.estimateId === initialWorkflow.estimateId) setUnsavedChanges(detail.dirty);
    };
    window.addEventListener(ESTIMATE_DIRTY_STATE_EVENT, receiveDirtyState);
    return () => window.removeEventListener(ESTIMATE_DIRTY_STATE_EVENT, receiveDirtyState);
  }, [initialWorkflow.estimateId]);

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
    router.push("/cabinet/cart");
  });
  const generatePdf = () => {
    if (!proposal || pdfPending) return;
    startPdfTransition(async () => {
      const result = await generateEstimateVersionPdfAction(proposal.id);
      if (!result.success) return setMessage(copy.operationFailed);
      setGeneratedDocument(result.data);
      notifyEstimatePdfReady(result.data);
      setMessage(copy.pdfReady);
      recordBehaviorInteraction({ eventName: "proposal_pdf_generated", route: "/cabinet/estimates/detail", sourceSurface: "proposal_workflow" });
    });
  };
  const revoke = (deliveryId: string) => run(() => revokeProposalDeliveryAction(deliveryId));

  const sendDialog = proposal ? <SendProposalDialog
    canSend
    currentVersion
    customer={initialWorkflow.customer ?? null}
    defaults={proposal.deliveryDefaults}
    emailAvailable={initialWorkflow.emailDeliveryAvailable}
    estimateId={initialWorkflow.estimateId}
    initialOpen={initialProposalAction?.kind === "resend" && initialProposalAction.versionId === proposal.id}
    pdfFilename={`${proposal.estimateNumber ?? proposal.label.split(" / ")[0]}.pdf`}
    pdfReady={pdfStatus === "ready"}
    proposalNumber={proposal.estimateNumber ?? proposal.label.split(" / ")[0]}
    proposalTotal={proposal.total}
    triggerLabel={guided.secondaryActions.includes("resend") ? copy.sendAgain : copy.sendToCustomer}
    triggerTone={guided.primaryAction === "send" ? "primary" : "secondary"}
    unsavedChanges={unsavedChanges}
    versionId={proposal.id}
  /> : null;

  return <section className="scroll-mt-24 border-y border-zinc-200 bg-white px-4 py-4 sm:px-5" data-testid="estimate-guided-workflow" id="estimate-order-conversion">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{copy.guidedCurrentState}</p>
        <h2 className="mt-1 text-lg font-semibold text-zinc-950">{guidedStateLabel(guided.state, copy)}</h2>
        <GuidedContext copy={copy} latestDelivery={latestDelivery} locale={locale} proposalSentAt={proposal?.sentAt ?? null} state={guided.state} />
      </div>
      {guided.primaryAction ? <div className="w-full shrink-0 sm:w-auto" data-testid="estimate-primary-next-action">
        {guided.primaryAction === "send" ? sendDialog : null}
        {guided.primaryAction === "update" && proposal ? <button className={`${primary} w-full sm:w-auto`} disabled={pending} onClick={() => run(() => createDraftFromEstimateVersionAction(proposal.id))} type="button">{copy.updateProposal}</button> : null}
        {guided.primaryAction === "continue_order" ? <button className={`${primary} w-full sm:w-auto`} disabled={pending} onClick={() => setConversionOpen(true)} type="button"><ShoppingCart className="size-4" />{copy.placeOrder}</button> : null}
        {guided.primaryAction === "resume_checkout" ? <Link className={`${primary} w-full sm:w-auto`} href="/cabinet/cart"><ShoppingCart className="size-4" />{copy.resumeOrder}</Link> : null}
        {guided.primaryAction === "open_order" && initialWorkflow.lifecycleOrderId ? <Link className={`${primary} w-full sm:w-auto`} href={`/cabinet/orders/${initialWorkflow.lifecycleOrderId}`}>{copy.openOrder}</Link> : null}
      </div> : null}
    </div>

    {message ? <p aria-live="polite" className="mt-3 border-l-4 border-emerald-600 bg-emerald-50 px-3 py-2 text-sm">{message}</p> : null}

    {proposal && guided.secondaryActions.some((action) => ["preview", "pdf", "send", "resend"].includes(action)) ? <div aria-label={copy.proposalOutputActions} className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
      {guided.secondaryActions.includes("preview") ? <Link className={quiet} href={`/cabinet/estimates/${initialWorkflow.estimateId}/versions/${proposal.id}/preview`} prefetch={false}>{copy.preview}</Link> : null}
      {guided.secondaryActions.includes("pdf") && pdfStatus !== "ready" ? <button aria-describedby={pdfPending ? "estimate-pdf-progress" : undefined} className={quiet} disabled={pdfPending} onClick={generatePdf} type="button"><Download className="size-4" />{pdfPending ? copy.preparing : copy.generatePdf}</button> : null}
      {pdfPending ? <span aria-live="polite" className="text-sm text-zinc-600" id="estimate-pdf-progress" role="status">{copy.preparing}</span> : null}
      {guided.secondaryActions.includes("pdf") && pdfDocumentId && pdfStatus === "ready" ? <Link className={quiet} href={`/api/estimates/documents/${pdfDocumentId}`}><Download className="size-4" />{copy.downloadPdf}</Link> : null}
      {guided.primaryAction !== "send" && (guided.secondaryActions.includes("send") || guided.secondaryActions.includes("resend")) ? sendDialog : null}
    </div> : null}

    {proposal && guided.secondaryActions.includes("delivery_history") ? <details className="mt-3 border-t border-zinc-100 pt-2" onToggle={(event) => setHistoryOpen(event.currentTarget.open)}>
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-zinc-700">{copy.deliveryHistory.replace("{count}", String(proposal.deliveries.length))}</summary>
      {historyOpen ? <div className="space-y-2 pb-2">
        <p className="text-xs text-zinc-500">{copy.newestFirst}</p>
        {proposal.deliveries.map((delivery) => <DeliveryRow copy={copy} delivery={delivery} key={delivery.id} locale={locale} onRevoke={revoke} pending={pending} />)}
      </div> : null}
    </details> : null}

    {guided.secondaryActions.some((action) => ["mark_ready", "duplicate", "save_template", "mark_sent", "record_response"].includes(action)) ? <details className="mt-2 border-t border-zinc-100 pt-2">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-zinc-700">{copy.otherActions}</summary>
      <div className="flex flex-wrap items-center gap-2 pb-2">
        {guided.secondaryActions.includes("mark_ready") ? <button className={secondary} disabled={pending || !initialWorkflow.readiness.ready} onClick={() => run(() => markEstimateReadyAction(initialWorkflow.estimateId, revision))} type="button"><CheckCircle2 className="size-4" />{copy.markReady}</button> : null}
        {guided.secondaryActions.includes("duplicate") ? <button className={secondary} disabled={pending} onClick={duplicate} type="button"><Copy className="size-4" />{copy.duplicateEstimate}</button> : null}
        {guided.secondaryActions.includes("save_template") ? <TemplateButton copy={copy} estimateId={initialWorkflow.estimateId} pending={pending} setMessage={setMessage} startTransition={startTransition} /> : null}
        {guided.secondaryActions.includes("mark_sent") && proposal ? <button className={secondary} disabled={pending} onClick={() => run(() => transitionEstimateVersionAction(proposal.id, "sent", "other"))} type="button"><Send className="size-4" />{copy.sentToCustomer}</button> : null}
        {guided.secondaryActions.includes("record_response") && proposal ? <><button className={secondary} disabled={pending} onClick={() => run(() => transitionEstimateVersionAction(proposal.id, "accepted"))} type="button"><CheckCircle2 className="size-4" />{copy.acceptedByCustomerAction}</button><label className="sr-only" htmlFor="estimate-rejection-reason">{copy.rejectionReason}</label><select className={`${input} w-auto min-w-44`} id="estimate-rejection-reason" onChange={(event) => setRejectionReason(event.target.value as typeof rejectionReason)} value={rejectionReason}><option value="">{copy.rejectionReason}</option><option value="price">{copy.rejectionPrice}</option><option value="no_budget">{copy.rejectionNoBudget}</option><option value="other_supplier">{copy.rejectionOtherSupplier}</option><option value="project_changed">{copy.rejectionProjectChanged}</option><option value="postponed">{copy.rejectionPostponed}</option><option value="other">{copy.rejectionOther}</option></select><button className={secondary} disabled={pending || !rejectionReason} onClick={() => run(() => transitionEstimateVersionAction(proposal.id, "rejected", null, "", rejectionReason || undefined))} type="button"><XCircle className="size-4" />{copy.rejectedAction}</button></> : null}
      </div>
    </details> : null}

    <ConfirmationDialog confirmLabel={copy.addEquipmentToCart} consequence={copy.cartConversionConsequence} open={conversionOpen} onCancel={() => setConversionOpen(false)} onConfirm={() => { setConversionOpen(false); addToCart(); }} pending={pending} title={copy.orderCreation}><p className="text-sm text-zinc-700">{copy.cartConversionHint}</p></ConfirmationDialog>
  </section>;
}

function GuidedContext({ copy, latestDelivery, locale, proposalSentAt, state }: {
  copy: EstimatesCopy;
  latestDelivery: ProposalDeliverySummaryDto | null;
  locale: "ru" | "ro";
  proposalSentAt: string | null;
  state: EstimateGuidedState;
}) {
  const awaiting = state === "awaiting_customer" || state === "awaiting_customer_opened";
  const timestamp = state === "awaiting_customer_opened" && latestDelivery?.openedAt ? latestDelivery.openedAt : latestDelivery?.sentAt ?? proposalSentAt;
  const timestampLabel = state === "awaiting_customer_opened" ? copy.lastOpenedAt : copy.sentAtLabel;
  return <div className="mt-1 text-sm text-zinc-600">
    {awaiting ? <p>{copy.awaitingCustomerDecision}</p> : null}
    {state === "accepted_already_converted" ? <p>{copy.acceptedAlreadyConvertedHint}</p> : null}
    {latestDelivery?.recipient ? <p className="truncate font-medium text-zinc-800">{latestDelivery.recipient}</p> : null}
    {timestamp ? <p>{timestampLabel}: {formatPartnerDateTime(timestamp, locale)}</p> : null}
  </div>;
}

function DeliveryRow({ copy, delivery, locale, onRevoke, pending }: {
  copy: EstimatesCopy;
  delivery: ProposalDeliverySummaryDto;
  locale: "ru" | "ro";
  onRevoke: (deliveryId: string) => void;
  pending: boolean;
}) {
  return <div className="flex flex-col gap-1 border-l-2 border-zinc-300 bg-zinc-50 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
    <span><strong>{delivery.recipient}</strong> · {deliveryStatusLabel(delivery.status, copy)}{delivery.sentAt ? ` · ${formatPartnerDateTime(delivery.sentAt, locale)}` : ""}{delivery.openedAt ? ` · ${copy.opened} ${formatPartnerDateTime(delivery.openedAt, locale)}` : ""}{delivery.response ? ` · ${delivery.response === "accepted" ? copy.acceptedShort : copy.rejectedShort}` : ""}{delivery.failureReason ? ` · ${copy.deliveryFailed}` : ""}</span>
    {!delivery.response && delivery.status !== "revoked" ? <button className="min-h-11 self-start font-semibold text-red-700 sm:self-auto" disabled={pending} onClick={() => onRevoke(delivery.id)} type="button">{copy.revokeLink}</button> : null}
  </div>;
}

function guidedStateLabel(state: EstimateGuidedState, copy: EstimatesCopy): string {
  return ({
    draft: copy.guidedDraft,
    ready_to_send: copy.guidedReadyToSend,
    awaiting_customer: copy.guidedAwaitingCustomer,
    awaiting_customer_opened: copy.guidedOpened,
    expired: copy.guidedExpired,
    accepted_ready_to_order: copy.guidedAccepted,
    resume_checkout: copy.guidedResumeCheckout,
    accepted_already_converted: copy.guidedAlreadyConverted,
    rejected: copy.guidedRejected,
    converted_to_order: copy.guidedConverted,
  })[state];
}

function TemplateButton({ copy, estimateId, pending, setMessage, startTransition }: { copy: EstimatesCopy; estimateId: string; pending: boolean; setMessage: (message: string) => void; startTransition: ReturnType<typeof useTransition>[1] }) {
  const [name, setName] = useState("");
  return <details className="relative"><summary className={`${secondary} cursor-pointer list-none`}>{copy.saveAsTemplate}</summary><div className="absolute left-0 z-10 mt-2 w-72 border border-zinc-200 bg-white p-3 shadow-lg sm:left-auto sm:right-0"><label className="text-xs font-medium">{copy.templateName}<input className={`${input} mt-1`} maxLength={120} onChange={(event) => setName(event.target.value)} value={name} /></label><button className={`${primary} mt-3 w-full`} disabled={pending || !name.trim()} onClick={() => startTransition(async () => { const result = await saveEstimateAsTemplateAction(estimateId, name); setMessage(result.success ? copy.operationSucceeded : copy.operationFailed); if (result.success) setName(""); })} type="button">{copy.save}</button></div></details>;
}

function deliveryStatusLabel(status: ProposalDeliverySummaryDto["status"], copy: EstimatesCopy): string { return ({ queued: copy.deliveryQueued, sending: copy.deliverySending, sent: copy.deliverySent, delivered: copy.deliveryDelivered, failed: copy.deliveryFailed, revoked: copy.deliveryRevoked, responded: copy.deliveryResponded })[status]; }
const input = "min-h-11 w-full border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45";
const secondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45";
const quiet = "inline-flex min-h-11 items-center justify-center gap-2 px-2 text-sm font-semibold text-zinc-600 underline-offset-4 hover:text-zinc-950 hover:underline focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45";

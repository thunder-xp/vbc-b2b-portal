"use client";

import { AlertTriangle, CheckCircle2, Download, FilePlus2, Plus, Save, Send, ShoppingCart, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import { formatPartnerDateTime, getEstimatesCopy, usePartnerLocale, type EstimatesCopy } from "../../partner-locale";
import { revokeProposalDeliveryAction } from "../actions/delivery.actions";
import {
  addEstimateEquipmentToCartAction,
  createEstimateVersionAction,
  createDraftFromEstimateVersionAction,
  transitionEstimateVersionAction,
} from "../actions/lifecycle.actions";
import { generateEstimateVersionPdfAction } from "../actions/proposal.actions";
import type {
  EstimateDraftReadinessDto,
  EstimateDraftReadinessState,
  EstimateRejectionReason,
  EstimateCartConversionSummary,
  EstimateWorkflowDto,
  ProposalDeliverySummaryDto,
} from "../types";
import { ESTIMATE_DIRTY_STATE_EVENT, type EstimateDirtyStateDetail } from "./estimate-client-events";
import { ESTIMATE_PDF_READY_EVENT, notifyEstimatePdfReady, type EstimatePdfReadyDetail } from "./EstimatePdfShareAction";
import { SendProposalDialog } from "./SendProposalDialog";

export function EstimateWorkflowPanel({ initialWorkflow, revision, initialProposalAction, draftReadiness = initialWorkflow.draftReadiness ?? inactiveDraftReadiness, onDraftPrimaryAction = () => undefined, editorOwnsSave = false }: {
  initialWorkflow: EstimateWorkflowDto;
  revision: number;
  initialProposalAction?: { kind: "resend"; versionId: string } | null;
  draftReadiness?: EstimateDraftReadinessDto;
  onDraftPrimaryAction?: (readiness: EstimateDraftReadinessDto) => void;
  editorOwnsSave?: boolean;
}) {
  const locale = usePartnerLocale();
  const copy = getEstimatesCopy(locale);
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [conversionResult, setConversionResult] = useState<EstimateCartConversionSummary | null>(null);
  const [rejectionReason, setRejectionReason] = useState<EstimateRejectionReason | "">("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [conversionRequestKey] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const [pdfPending, startPdfTransition] = useTransition();
  const proposal = initialWorkflow.versions.find((item) => item.id === initialWorkflow.acceptedVersionId) ?? initialWorkflow.versions[0] ?? null;
  const [generatedDocument, setGeneratedDocument] = useState<EstimatePdfReadyDetail | null>(null);
  const pdfStatus = generatedDocument ? "ready" : proposal?.pdfStatus ?? null;
  const pdfDocumentId = generatedDocument?.id ?? proposal?.pdfDocumentId ?? null;
  const locallyReadyPdf = draftReadiness.state === "prepare_pdf" && pdfStatus === "ready";
  const draftGuide = draftReadiness.state !== "not_applicable"
    && draftReadiness.state !== "handoff"
    && !locallyReadyPdf
    ? draftReadiness
    : null;
  const guided = locallyReadyPdf ? {
    ...initialWorkflow.guidedState,
    state: "ready_to_send" as const,
    primaryAction: initialWorkflow.permissions.canSend ? "send" as const : null,
  } : initialWorkflow.guidedState;

  useEffect(() => {
    const receiveDirtyState = (event: Event) => {
      const detail = (event as CustomEvent<EstimateDirtyStateDetail>).detail;
      if (detail.estimateId === initialWorkflow.estimateId) setUnsavedChanges(detail.dirty);
    };
    window.addEventListener(ESTIMATE_DIRTY_STATE_EVENT, receiveDirtyState);
    return () => window.removeEventListener(ESTIMATE_DIRTY_STATE_EVENT, receiveDirtyState);
  }, [initialWorkflow.estimateId]);

  useEffect(() => {
    const receiveReadyPdf = (event: Event) => {
      const detail = (event as CustomEvent<EstimatePdfReadyDetail>).detail;
      if (detail.estimateId === initialWorkflow.estimateId && detail.versionId === proposal?.id && detail.estimateRevision === revision) {
        setGeneratedDocument(detail);
      }
    };
    window.addEventListener(ESTIMATE_PDF_READY_EVENT, receiveReadyPdf);
    return () => window.removeEventListener(ESTIMATE_PDF_READY_EVENT, receiveReadyPdf);
  }, [initialWorkflow.estimateId, proposal?.id, revision]);

  const run = (operation: () => Promise<{ success: boolean; message: string }>, after?: () => void) => startTransition(async () => {
    const result = await operation();
    setMessage(result.success ? copy.operationSucceeded : copy.operationFailed);
    if (result.success) { after?.(); router.refresh(); }
  });
  const addToCart = () => startTransition(async () => {
    if (unsavedChanges) return setMessage(copy.saveBeforeCart);
    setMessage(null);
    const result = await addEstimateEquipmentToCartAction(initialWorkflow.estimateId, revision, conversionRequestKey);
    if (!result.success) return setMessage(result.message || copy.operationFailed);
    setConversionResult(result.data);
    router.refresh();
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
  const prepareProposal = () => startTransition(async () => {
    const result = await createEstimateVersionAction(initialWorkflow.estimateId, revision, requestKey, "");
    setMessage(result.success ? copy.operationSucceeded : copy.operationFailed);
    if (result.success || result.errorCode === "ESTIMATE_VERSION_CONFLICT") {
      setRequestKey(crypto.randomUUID());
      router.refresh();
    }
  });
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
    triggerTone={initialWorkflow.customer?.primaryEmail && guided.primaryAction === "send" ? "primary" : "secondary"}
    unsavedChanges={unsavedChanges}
    versionId={proposal.id}
  /> : null;

  return <section className="mt-3 border-t border-zinc-200 pt-3" data-draft-readiness-state={draftGuide?.state} data-testid="estimate-guided-workflow" id="estimate-order-conversion">
    <div className="grid gap-2">
      {draftGuide?.primaryAction ? <div className="w-full" data-testid="estimate-primary-next-action">
        {draftGuide.primaryAction === "prepare_proposal" ? <button className={`${primary} w-full`} disabled={pending} onClick={prepareProposal} type="button"><FilePlus2 className="size-4" />{pending ? copy.preparing : copy.prepareProposal}</button> : null}
        {draftGuide.primaryAction === "generate_pdf" ? <button className={`${primary} w-full`} disabled={pdfPending} onClick={generatePdf} type="button"><Download className="size-4" />{pdfPending ? copy.preparing : copy.prepareProposal}</button> : null}
        {!["prepare_proposal", "generate_pdf"].includes(draftGuide.primaryAction) && !(editorOwnsSave && draftGuide.primaryAction === "save") ? <button aria-keyshortcuts={draftGuide.primaryAction === "save" ? "Control+S Meta+S" : undefined} className={`${primary} w-full`} disabled={pending} onClick={() => onDraftPrimaryAction(draftGuide)} type="button">{draftPrimaryIcon(draftGuide.primaryAction)}{draftPrimaryLabel(draftGuide.state, copy)}</button> : null}
      </div> : guided.primaryAction && !["send", "continue_order"].includes(guided.primaryAction) ? <div className="w-full" data-testid="estimate-primary-next-action">
        {guided.primaryAction === "update" && proposal ? <button className={`${primary} w-full`} disabled={pending} onClick={() => run(() => createDraftFromEstimateVersionAction(proposal.id))} type="button">{copy.updateProposal}</button> : null}
        {guided.primaryAction === "resume_checkout" ? <Link className={`${primary} w-full`} href="/cabinet/cart"><ShoppingCart className="size-4" />{copy.resumeOrder}</Link> : null}
        {guided.primaryAction === "open_order" && initialWorkflow.lifecycleOrderId ? <Link className={`${primary} w-full`} href={`/cabinet/orders/${initialWorkflow.lifecycleOrderId}`}>{copy.openOrder}</Link> : null}
      </div> : null}
      {initialWorkflow.permissions.canConvert ? <button className={`${primary} w-full`} data-testid="estimate-transfer-to-cart" disabled={pending || unsavedChanges} onClick={addToCart} type="button"><ShoppingCart aria-hidden="true" className="size-4" />{copy.addEquipmentToCart}</button> : null}
    </div>

    {message ? <p aria-live="polite" className="mt-3 border-l-4 border-emerald-600 bg-emerald-50 px-3 py-2 text-sm">{message}</p> : null}

    {conversionResult ? <div aria-live="polite" className="mt-3 border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm text-zinc-800" data-testid="estimate-cart-transfer-summary">
      <p className="font-semibold text-zinc-950">{copy.cartTransferSuccess.replace("{count}", String(conversionResult.totalLines))}</p>
      <p className="mt-1">{copy.cartTransferSummary
        .replace("{total}", String(conversionResult.totalLines))
        .replace("{full}", String(conversionResult.fullyAvailable))
        .replace("{partial}", String(conversionResult.partiallyAvailable))
        .replace("{unavailable}", String(conversionResult.unavailable))}</p>
      {conversionResult.stockUnknown > 0 ? <p className="mt-1 text-amber-800">{copy.cartTransferUnknown.replace("{count}", String(conversionResult.stockUnknown))}</p> : null}
      {conversionResult.externalLines > 0 ? <p className="mt-1 text-zinc-600">{copy.cartTransferExternal.replace("{count}", String(conversionResult.externalLines))}</p> : null}
      <Link className="mt-3 inline-flex min-h-11 items-center gap-2 bg-zinc-950 px-4 font-semibold text-white" href="/cabinet/cart"><ShoppingCart className="size-4" />{copy.goToCart}</Link>
    </div> : null}

    {!draftGuide && proposal && (guided.primaryAction === "send" || guided.secondaryActions.some((action) => ["pdf", "send", "resend", "mark_sent", "record_response"].includes(action))) ? <div className="mt-3 grid gap-2 border-t border-zinc-100 pt-3" data-testid="estimate-stage-actions">
      {guided.primaryAction === "send" ? sendDialog : null}
      {guided.secondaryActions.includes("pdf") && pdfStatus !== "ready" ? <button aria-describedby={pdfPending ? "estimate-pdf-progress" : undefined} className={quiet} disabled={pdfPending} onClick={generatePdf} type="button"><Download className="size-4" />{pdfPending ? copy.preparing : copy.generatePdf}</button> : null}
      {pdfPending ? <span aria-live="polite" className="text-sm text-zinc-600" id="estimate-pdf-progress" role="status">{copy.preparing}</span> : null}
      {guided.secondaryActions.includes("pdf") && pdfDocumentId && pdfStatus === "ready" ? <Link className={quiet} href={`/api/estimates/documents/${pdfDocumentId}`}><Download className="size-4" />{copy.downloadPdf}</Link> : null}
      {guided.primaryAction !== "send" && (guided.secondaryActions.includes("send") || guided.secondaryActions.includes("resend")) ? sendDialog : null}
      {guided.secondaryActions.includes("mark_sent") ? <button className={`${secondary} w-full`} disabled={pending} onClick={() => run(() => transitionEstimateVersionAction(proposal.id, "sent", "other"))} type="button"><Send className="size-4" />{copy.sentToCustomer}</button> : null}
      {guided.secondaryActions.includes("record_response") ? <><button className={`${secondary} w-full`} disabled={pending} onClick={() => run(() => transitionEstimateVersionAction(proposal.id, "accepted"))} type="button"><CheckCircle2 className="size-4" />{copy.acceptedByCustomerAction}</button><label className="sr-only" htmlFor="estimate-rejection-reason">{copy.rejectionReason}</label><select className={`${input} w-full`} id="estimate-rejection-reason" onChange={(event) => setRejectionReason(event.target.value as typeof rejectionReason)} value={rejectionReason}><option value="">{copy.rejectionReason}</option><option value="price">{copy.rejectionPrice}</option><option value="no_budget">{copy.rejectionNoBudget}</option><option value="other_supplier">{copy.rejectionOtherSupplier}</option><option value="project_changed">{copy.rejectionProjectChanged}</option><option value="postponed">{copy.rejectionPostponed}</option><option value="other">{copy.rejectionOther}</option></select><button className={`${secondary} w-full`} disabled={pending || !rejectionReason} onClick={() => run(() => transitionEstimateVersionAction(proposal.id, "rejected", null, "", rejectionReason || undefined))} type="button"><XCircle className="size-4" />{copy.rejectedAction}</button></> : null}
    </div> : null}

    {proposal && guided.secondaryActions.includes("delivery_history") ? <details className="mt-3 border-t border-zinc-100 pt-2" onToggle={(event) => setHistoryOpen(event.currentTarget.open)}>
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-zinc-700">{copy.deliveryHistory.replace("{count}", String(proposal.deliveries.length))}</summary>
      {historyOpen ? <div className="space-y-2 pb-2">
        <p className="text-xs text-zinc-500">{copy.newestFirst}</p>
        {proposal.deliveries.map((delivery) => <DeliveryRow copy={copy} delivery={delivery} key={delivery.id} locale={locale} onRevoke={revoke} pending={pending} />)}
      </div> : null}
    </details> : null}

  </section>;
}

function draftPrimaryLabel(state: EstimateDraftReadinessState, copy: EstimatesCopy): string {
  if (state === "add_product") return copy.mobileAddProduct;
  if (state === "save_changes") return copy.save;
  if (state === "fix_settings") return copy.draftOpenSettingsAction;
  return copy.draftFixLineAction;
}

function draftPrimaryIcon(action: NonNullable<EstimateDraftReadinessDto["primaryAction"]>) {
  if (action === "add_product") return <Plus className="size-4" />;
  if (action === "save") return <Save className="size-4" />;
  return <AlertTriangle className="size-4" />;
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

function deliveryStatusLabel(status: ProposalDeliverySummaryDto["status"], copy: EstimatesCopy): string { return ({ queued: copy.deliveryQueued, sending: copy.deliverySending, sent: copy.deliverySent, delivered: copy.deliveryDelivered, failed: copy.deliveryFailed, revoked: copy.deliveryRevoked, responded: copy.deliveryResponded })[status]; }
const input = "min-h-11 w-full border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45";
const secondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45";
const quiet = "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-zinc-300 px-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45";
const inactiveDraftReadiness: EstimateDraftReadinessDto = { state: "not_applicable", primaryAction: null, target: null, linePosition: null, ready: true, checks: [] };

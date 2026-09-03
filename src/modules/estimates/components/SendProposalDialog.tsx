"use client";

import { Copy, Mail, Send, X } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import { revokeProposalDeliveryAction, sendProposalDeliveryAction } from "../actions/delivery.actions";
import type { ProposalDeliverySummaryDto } from "../types";
import { formatPartnerDateTime, getEstimatesCopy, usePartnerLocale, type EstimatesCopy } from "../../partner-locale";

export function SendProposalDialog({ versionId, versionLabel, deliveries, canSend, emailAvailable, pdfReady, initialOpen = false, defaults }: {
  versionId: string;
  versionLabel: string;
  deliveries: ProposalDeliverySummaryDto[];
  canSend: boolean;
  emailAvailable: boolean;
  pdfReady: boolean;
  initialOpen?: boolean;
  defaults?: { recipientName: string; subject: string; message: string };
}) {
  const locale = usePartnerLocale();
  const copy = getEstimatesCopy(locale);
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(initialOpen && canSend));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const send = (formData: FormData) => startTransition(async () => {
    const result = await sendProposalDeliveryAction({
      versionId,
      recipientEmail: String(formData.get("recipientEmail") ?? ""),
      recipientName: String(formData.get("recipientName") ?? ""),
      subject: String(formData.get("subject") ?? ""),
      message: String(formData.get("message") ?? ""),
      locale: formData.get("locale") === "ro" ? "ro" : "ru",
      expirationDays: Number(formData.get("expirationDays")),
      attachPdf: formData.get("attachPdf") === "on",
      idempotencyKey: crypto.randomUUID(),
    });
    setMessage(result.success ? copy.operationSucceeded : copy.operationFailed);
    if (result.success) {
      recordBehaviorInteraction({ eventName: "proposal_sent", route: "/cabinet/estimates/detail", sourceSurface: "proposal_delivery" });
      setPublicUrl(result.data.publicUrl);
      router.refresh();
    } else recordBehaviorInteraction({ eventName: "proposal_send_failed", route: "/cabinet/estimates/detail", sourceSurface: "proposal_delivery" });
  });

  return <>
    <div className="flex flex-col items-start gap-1">
      <button className={secondary} disabled={!canSend} onClick={() => { setMessage(null); setPublicUrl(null); setOpen(true); }} type="button"><Mail className="size-4" />{deliveries.length ? copy.sendAgain : copy.send}</button>
      {!emailAvailable && <span className="max-w-48 text-xs text-zinc-500">{copy.emailUnavailable}</span>}
      {emailAvailable && !pdfReady && <span className="max-w-48 text-xs text-zinc-500">{copy.generatePdfFirst}</span>}
    </div>
    {open && <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }} role="dialog">
      <form action={send} className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl">
        <header className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-semibold">{copy.sendProposal}</h3><p className="mt-1 text-sm text-zinc-500">{versionLabel}</p></div><button aria-label={copy.cancel} className="grid size-9 place-items-center" onClick={() => setOpen(false)} type="button"><X className="size-5" /></button></header>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label={copy.recipientEmail}><input aria-label={copy.recipientEmail} autoFocus className={input} maxLength={254} name="recipientEmail" required type="email" /><span className="text-xs font-normal text-zinc-500">{copy.recipientEmailHint}</span></Field>
          <Field label={copy.recipientName}><input className={input} defaultValue={defaults?.recipientName} maxLength={160} name="recipientName" /></Field>
          <Field className="sm:col-span-2" label={copy.subject}><input className={input} defaultValue={defaults?.subject ?? `${copy.commercialProposal} ${versionLabel}`} maxLength={200} name="subject" required /></Field>
          <Field className="sm:col-span-2" label={copy.message}><textarea className={`${input} min-h-24 py-2`} defaultValue={defaults?.message} maxLength={4000} name="message" /></Field>
          <Field label={copy.emailLanguage}><select className={input} defaultValue={locale} name="locale"><option value="ru">{copy.russian}</option><option value="ro">Română</option></select></Field>
          <Field label={copy.linkValidity}><select className={input} defaultValue="14" name="expirationDays">{[7,14,30].map((days) => <option key={days} value={days}>{days} {copy.days}</option>)}</select></Field>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm"><input defaultChecked name="attachPdf" type="checkbox" />{copy.attachPdf}</label>
        <p className="mt-1 text-xs text-zinc-500">{copy.attachmentFallback}</p>
        {message && <p aria-live="polite" className="mt-4 bg-zinc-50 px-3 py-2 text-sm">{message}</p>}
        {publicUrl && <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]"><input aria-label={copy.secureLink} className={input} readOnly value={publicUrl} /><button className={secondary} onClick={async () => { await navigator.clipboard.writeText(publicUrl); setMessage(copy.copied); }} type="button"><Copy className="size-4" />{copy.copy}</button></div>}
        <footer className="mt-5 flex justify-end gap-2"><button className={secondary} onClick={() => setOpen(false)} type="button">{copy.cancel}</button><button className={primary} disabled={pending} type="submit"><Send className="size-4" />{pending ? copy.sending : copy.send}</button></footer>
      </form>
    </div>}
    {deliveries.length > 0 && <div className="mt-3 w-full space-y-2">
      {deliveries.map((delivery) => <div className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-emerald-600 bg-zinc-50 px-3 py-2 text-xs" key={delivery.id}>
        <span><strong>{delivery.recipient}</strong> · {deliveryStatusLabel(delivery.status, copy)}{delivery.sentAt ? ` · ${formatPartnerDateTime(delivery.sentAt, locale)}` : ""}{delivery.openedAt ? ` · ${copy.opened} ${formatPartnerDateTime(delivery.openedAt, locale)}` : ""}{delivery.response ? ` · ${delivery.response === "accepted" ? copy.acceptedShort : copy.rejectedShort}` : ""}{delivery.failureReason ? ` · ${copy.deliveryFailed}` : ""}</span>
        {!delivery.response && delivery.status !== "revoked" && <button className="font-semibold text-red-700" disabled={pending} onClick={() => startTransition(async () => { const result = await revokeProposalDeliveryAction(delivery.id); setMessage(result.success ? copy.operationSucceeded : copy.operationFailed); if(result.success) router.refresh(); })} type="button">{copy.revokeLink}</button>}
      </div>)}
    </div>}
  </>;
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) { return <label className={`grid gap-1 text-sm font-medium ${className}`}>{label}{children}</label>; }
function deliveryStatusLabel(status: ProposalDeliverySummaryDto["status"], copy: EstimatesCopy): string { return ({ queued: copy.deliveryQueued, sending: copy.deliverySending, sent: copy.deliverySent, delivered: copy.deliveryDelivered, failed: copy.deliveryFailed, revoked: copy.deliveryRevoked, responded: copy.deliveryResponded })[status]; }
const input = "min-h-11 w-full border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-45";
const secondary = "inline-flex min-h-11 items-center justify-center gap-2 border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 disabled:opacity-45";

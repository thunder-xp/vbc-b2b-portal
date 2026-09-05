"use client";

import { CheckCircle2, Mail, Send, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import { getEstimatesCopy, usePartnerLocale } from "../../partner-locale";
import { sendProposalDeliveryAction } from "../actions/delivery.actions";
import { updateFinalCustomerEmailAction } from "../actions/estimate.actions";

type CustomerRecipient = {
  id: string;
  displayName: string;
  primaryEmail: string | null;
  revision: number;
};

export function SendProposalDialog({
  estimateId,
  versionId,
  proposalNumber,
  proposalTotal,
  pdfFilename,
  customer,
  canSend,
  emailAvailable,
  pdfReady,
  currentVersion,
  unsavedChanges,
  initialOpen = false,
  triggerLabel,
  triggerTone = "primary",
  defaults,
}: {
  estimateId: string;
  versionId: string;
  proposalNumber: string;
  proposalTotal: string;
  pdfFilename: string;
  customer: CustomerRecipient | null;
  canSend: boolean;
  emailAvailable: boolean;
  pdfReady: boolean;
  currentVersion: boolean;
  unsavedChanges: boolean;
  initialOpen?: boolean;
  triggerLabel?: string;
  triggerTone?: "primary" | "secondary";
  defaults?: { recipientName: string; subject: string; message: string };
}) {
  const locale = usePartnerLocale();
  const copy = getEstimatesCopy(locale);
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sendingRef = useRef(false);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const [open, setOpen] = useState(Boolean(initialOpen && canSend && emailAvailable && pdfReady && currentVersion && !unsavedChanges));
  const [recipientEmail, setRecipientEmail] = useState(customer?.primaryEmail ?? "");
  const [recipientDraft, setRecipientDraft] = useState(customer?.primaryEmail ?? "");
  const [recipientEditing, setRecipientEditing] = useState(!customer?.primaryEmail);
  const [recipientTouched, setRecipientTouched] = useState(false);
  const [customerRevision, setCustomerRevision] = useState(customer?.revision ?? 0);
  const [resultState, setResultState] = useState<"idle" | "failed" | "sent">("idle");
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [emailPending, startEmailTransition] = useTransition();
  const normalizedDraft = recipientDraft.trim().toLowerCase();
  const recipientError = recipientTouched && !isValidEmail(normalizedDraft) ? copy.invalidCustomerEmail : null;
  const triggerAllowed = canSend && emailAvailable && pdfReady && currentVersion && !unsavedChanges;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const saveMissingEmail = () => {
    setRecipientTouched(true);
    if (!customer || !isValidEmail(normalizedDraft) || emailPending) return;
    startEmailTransition(async () => {
      const result = await updateFinalCustomerEmailAction({
        estimateId,
        customerId: customer.id,
        expectedRevision: customerRevision,
        primaryEmail: normalizedDraft,
      });
      if (!result.success) {
        setResultMessage(copy.operationFailed);
        return;
      }
      setCustomerRevision(result.data.revision);
      setRecipientEmail(result.data.primaryEmail);
      setRecipientDraft(result.data.primaryEmail);
      setRecipientEditing(false);
      setRecipientTouched(false);
      setResultMessage(copy.emailSaved);
    });
  };

  const send = (formData: FormData) => {
    const targetEmail = recipientEditing && recipientEmail ? normalizedDraft : recipientEmail;
    setRecipientTouched(true);
    if (!isValidEmail(targetEmail) || sendingRef.current) return;
    sendingRef.current = true;
    setResultState("idle");
    setResultMessage(null);
    startTransition(async () => {
      try {
        const result = await sendProposalDeliveryAction({
          versionId,
          recipientEmail: targetEmail,
          recipientName: customer?.displayName ?? defaults?.recipientName ?? "",
          subject: String(formData.get("subject") ?? defaults?.subject ?? ""),
          message: String(formData.get("message") ?? defaults?.message ?? ""),
          locale: formData.get("locale") === "ro" ? "ro" : "ru",
          expirationDays: Number(formData.get("expirationDays") ?? 14),
          attachPdf: true,
          idempotencyKey: idempotencyKeyRef.current,
        });
        if (!result.success) {
          setResultState("failed");
          setResultMessage(copy.deliveryFailedRetry);
          recordBehaviorInteraction({ eventName: "proposal_send_failed", route: "/cabinet/estimates/detail", sourceSurface: "proposal_delivery" });
          return;
        }
        setRecipientEmail(targetEmail);
        setResultState("sent");
        setResultMessage(copy.proposalSentTo.replace("{email}", targetEmail));
        idempotencyKeyRef.current = crypto.randomUUID();
        recordBehaviorInteraction({ eventName: "proposal_sent", route: "/cabinet/estimates/detail", sourceSurface: "proposal_delivery" });
        router.refresh();
      } finally {
        sendingRef.current = false;
      }
    });
  };

  return <>
    <div className="flex flex-col items-start gap-1">
      <button className={triggerTone === "primary" ? primary : secondary} disabled={!triggerAllowed} onClick={() => { setResultMessage(null); setResultState("idle"); setOpen(true); }} ref={triggerRef} type="button">
        <Mail className="size-4" />
        {customer?.primaryEmail || recipientEmail ? triggerLabel ?? copy.sendToCustomer : copy.addEmail}
      </button>
      {!emailAvailable ? <span className={hint}>{copy.emailUnavailable}</span> : null}
      {emailAvailable && !pdfReady ? <span className={hint}>{copy.generatePdfFirst}</span> : null}
      {!currentVersion ? <span className={hint}>{copy.staleProposal}</span> : null}
      {unsavedChanges ? <span className={hint}>{copy.saveBeforeSending}</span> : null}
    </div>

    {open ? <div aria-modal="true" className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center sm:p-4" onKeyDown={(event) => {
      if (event.key === "Escape") return close();
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary"));
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }} role="dialog">
      <form className="max-h-[calc(100dvh-env(safe-area-inset-top))] w-full overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:max-w-lg sm:rounded-md sm:p-6" onSubmit={(event) => { event.preventDefault(); send(new FormData(event.currentTarget)); }}>
        <header className="flex items-start justify-between gap-4">
          <div><h3 className="text-lg font-semibold">{copy.sendToCustomer}</h3><p className="mt-1 text-sm text-zinc-500">{proposalNumber}</p></div>
          <button aria-label={copy.cancel} autoFocus={!recipientEditing} className="grid size-11 place-items-center" onClick={close} type="button"><X className="size-5" /></button>
        </header>

        {resultState === "sent" ? <div className="mt-6" role="status">
          <div className="flex items-start gap-3 bg-emerald-50 p-4 text-emerald-900"><CheckCircle2 className="mt-0.5 size-5 shrink-0" /><p className="font-medium">{resultMessage}</p></div>
          <button className={`${primary} mt-5 w-full`} onClick={close} type="button">{copy.done}</button>
        </div> : <>
          <section aria-label={copy.sendProposal} className="mt-5 space-y-4">
            <div className="border-b border-zinc-200 pb-4">
              <div className="flex min-h-11 items-center justify-between gap-3">
                <div className="min-w-0"><p className="text-xs font-medium text-zinc-500">{copy.recipient}</p>{!recipientEditing && recipientEmail ? <p className="truncate text-sm font-semibold text-zinc-950">{recipientEmail}</p> : null}</div>
                {!recipientEditing && recipientEmail ? <button className="min-h-11 px-2 text-sm font-semibold text-emerald-800" onClick={() => { setRecipientDraft(recipientEmail); setRecipientEditing(true); }} type="button">{copy.changeRecipient}</button> : null}
              </div>
              {recipientEditing ? <div className="mt-2">
                {!recipientEmail ? <p className="mb-2 text-sm text-amber-800">{copy.customerEmailMissing}</p> : null}
                <input aria-describedby={recipientError ? "proposal-recipient-error" : undefined} aria-invalid={Boolean(recipientError)} aria-label={copy.recipientEmail} autoFocus className={input} inputMode="email" maxLength={254} onBlur={() => setRecipientTouched(true)} onChange={(event) => setRecipientDraft(event.target.value)} type="email" value={recipientDraft} />
                {recipientError ? <p className="mt-1 text-xs text-red-700" id="proposal-recipient-error">{recipientError}</p> : null}
                {!recipientEmail ? <button className={`${secondary} mt-2 w-full sm:w-auto`} disabled={emailPending || !customer} onClick={saveMissingEmail} type="button">{emailPending ? copy.savingShort : copy.saveEmail}</button> : null}
              </div> : null}
            </div>

            <dl className="grid gap-3 border-b border-zinc-200 pb-4 text-sm sm:grid-cols-2">
              <div><dt className="text-xs font-medium text-zinc-500">{copy.proposalFile}</dt><dd className="mt-1 font-semibold text-zinc-950">{pdfFilename}</dd></div>
              <div><dt className="text-xs font-medium text-zinc-500">{copy.payable}</dt><dd className="mt-1 font-semibold tabular-nums text-zinc-950">{proposalTotal}</dd></div>
            </dl>

            <details className="border-b border-zinc-200 pb-4">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-zinc-700">{copy.advanced}</summary>
              <div className="mt-3 grid gap-4">
                <Field label={copy.subject}><input className={input} defaultValue={defaults?.subject ?? `${copy.commercialProposal} ${proposalNumber}`} maxLength={200} name="subject" required /></Field>
                <Field label={copy.message}><textarea className={`${input} min-h-24 py-2`} defaultValue={defaults?.message} maxLength={4000} name="message" /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={copy.emailLanguage}><select className={input} defaultValue={locale} name="locale"><option value="ru">{copy.russian}</option><option value="ro">Română</option></select></Field>
                  <Field label={copy.linkValidity}><select className={input} defaultValue="14" name="expirationDays">{[7, 14, 30].map((days) => <option key={days} value={days}>{days} {copy.days}</option>)}</select></Field>
                </div>
              </div>
            </details>
          </section>

          {resultMessage ? <p aria-live="polite" className={`mt-4 px-3 py-2 text-sm ${resultState === "failed" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-900"}`}>{resultMessage}</p> : null}
          <button className={`${primary} mt-5 w-full`} disabled={pending || emailPending || !recipientEmail || (recipientEditing && !isValidEmail(normalizedDraft))} type="submit"><Send className="size-4" />{pending ? copy.sending : resultState === "failed" ? copy.retry : copy.send}</button>
        </>}
      </form>
    </div> : null}

  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1 text-sm font-medium">{label}{children}</label>; }
function isValidEmail(value: string) { return value.length > 0 && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !/[\r\n]/.test(value); }
const input = "min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45";
const secondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45";
const hint = "max-w-64 text-xs text-amber-800";

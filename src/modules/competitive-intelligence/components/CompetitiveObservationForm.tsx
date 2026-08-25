"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createCompetitiveObservationAction } from "../actions";
import { getCompetitiveIntelligenceCopy } from "../copy";
import type { CompetitorOption } from "../types";
import type { PartnerLocale } from "../../partner-locale";

export function CompetitiveObservationForm({
  competitors,
  locale,
  productId,
  today,
}: {
  competitors: CompetitorOption[];
  locale: PartnerLocale;
  productId: string;
  today: string;
}) {
  const copy = getCompetitiveIntelligenceCopy(locale);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const handledReceipt = useRef<string | null>(null);
  const [state, action, pending] = useActionState(createCompetitiveObservationAction, null);
  const [competitorId, setCompetitorId] = useState(competitors[0]?.id ?? "other");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!state?.success || handledReceipt.current === state.data.id) return;
    handledReceipt.current = state.data.id;
    if (!state.data.duplicate && !state.data.idempotent) formRef.current?.reset();
    setCompetitorId(competitors[0]?.id ?? "other");
    setIdempotencyKey(crypto.randomUUID());
    router.refresh();
  }, [competitors, router, state]);

  return (
    <form action={action} className="border-y border-zinc-200 py-4" ref={formRef}>
      <input name="productId" type="hidden" value={productId} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(11rem,1.3fr)_minmax(8rem,0.8fr)_7rem_9rem_7rem_10rem] lg:items-end">
        <Field label={copy.competitor}>
          <select className={controlClass} name="competitorId" onChange={(event) => setCompetitorId(event.target.value)} value={competitorId}>
            {competitors.map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.name}</option>)}
            <option value="other">{copy.otherCompetitor}</option>
          </select>
        </Field>
        {competitorId === "other" ? (
          <Field label={copy.competitorName}><input className={controlClass} maxLength={120} name="otherCompetitorName" required /></Field>
        ) : <div className="hidden lg:block" />}
        <Field label={copy.price}><input className={controlClass} inputMode="decimal" min="0.0001" name="price" required step="0.0001" type="number" /></Field>
        <Field label={copy.currency}><select className={controlClass} defaultValue="MDL" name="currency"><option>MDL</option><option>USD</option><option>EUR</option></select></Field>
        <Field label={copy.quantity}><input className={controlClass} defaultValue="1" inputMode="decimal" min="0.001" name="quantity" required step="0.001" type="number" /></Field>
        <Field label={copy.date}><input className={controlClass} defaultValue={today} max={today} name="observationDate" required type="date" /></Field>
      </div>
      <div className="mt-3 flex justify-end">
        <button className="min-h-11 bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 disabled:opacity-60" disabled={pending} type="submit">
          {pending ? copy.saving : copy.save}
        </button>
      </div>
      <details className="mt-3 border-t border-zinc-100 pt-3">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-zinc-700">{copy.details}</summary>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={copy.source}><select className={controlClass} defaultValue="verbal" name="sourceType">{Object.entries(copy.sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          <Field label={copy.evidence}><input accept="image/jpeg,image/png,image/webp,application/pdf" className={`${controlClass} p-2`} name="evidence" type="file" /></Field>
          <Field label={copy.payment}><input className={controlClass} maxLength={500} name="paymentTerms" /></Field>
          <Field label={copy.delivery}><input className={controlClass} maxLength={500} name="deliveryTerms" /></Field>
          <Field label={copy.comment}><input className={controlClass} maxLength={1000} name="comment" /></Field>
        </div>
      </details>
      {state ? (
        <div aria-live="polite" className={`mt-3 border px-3 py-2 text-sm ${state.success ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
          <p>{state.message}</p>
          {state.success && state.data.comparisonStatus === "comparable" ? (
            <p className="mt-1 font-semibold">{copy.difference}: {state.data.deltaAmount?.toFixed(2)} ({state.data.deltaPercent?.toFixed(2)}%)</p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

const controlClass = "min-h-11 w-full min-w-0 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-600";

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="grid min-w-0 gap-1 text-xs font-medium text-zinc-600"><span className="min-h-4">{label}</span>{children}</label>;
}

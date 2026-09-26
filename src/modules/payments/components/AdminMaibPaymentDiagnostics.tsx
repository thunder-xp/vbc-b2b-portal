"use client";

import { useActionState } from "react";

import {
  type ControlledLivePaymentActionState,
  type MaibConnectivityActionState,
  initiateControlledLivePaymentAdminAction,
  verifyMaibConnectivityAdminAction,
} from "../actions";
import type { MaibConfigurationSummary } from "../providers/maib/maib-checkout-v2.adapter";
import type { RetailOrderPaymentState } from "../types";

const INITIAL: MaibConnectivityActionState = {
  status: "IDLE",
  mode: "DISABLED",
  apiOrigin: null,
  clientIdFingerprint: null,
  authLatencyMs: null,
  safeError: null,
};
const CONTROLLED_INITIAL: ControlledLivePaymentActionState = {
  status: "IDLE",
  outcome: null,
  paymentAttemptId: null,
  checkoutUrl: null,
};

export function AdminMaibPaymentDiagnostics({
  configuration,
  controlledIdempotencyKey,
  payments,
}: Readonly<{
  configuration: MaibConfigurationSummary;
  controlledIdempotencyKey: string;
  payments: RetailOrderPaymentState[];
}>) {
  const [connectivity, action, pending] = useActionState(verifyMaibConnectivityAdminAction, INITIAL);
  const [controlled, controlledAction, controlledPending] = useActionState(initiateControlledLivePaymentAdminAction, CONTROLLED_INITIAL);
  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">MAIB payments</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Mode: <strong>{configuration.mode}</strong> · API: {configuration.apiOrigin ?? "not configured"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Client fingerprint: {configuration.clientIdFingerprint ?? "—"} · callback: {configuration.callbackUrl ?? "—"}
          </p>
        </div>
        <form action={action}>
          <button className="min-h-11 rounded-md border border-zinc-900 px-4 text-sm font-semibold disabled:opacity-50" disabled={pending}>
            {pending ? "Checking…" : "Verify OAuth connectivity"}
          </button>
        </form>
      </div>
      {connectivity.status !== "IDLE" ? (
        <p className={`rounded-md p-3 text-sm ${connectivity.status === "PASS" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`} role="status">
          {connectivity.status}{connectivity.authLatencyMs !== null ? ` · ${connectivity.authLatencyMs} ms` : ""}{connectivity.safeError ? ` · ${connectivity.safeError}` : ""}
        </p>
      ) : null}
      <form action={controlledAction} className="grid gap-3 border-t border-zinc-200 pt-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <label className="text-sm font-semibold" htmlFor="controlled-maib-order">Controlled production order</label>
          <input className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-3 font-mono text-sm" id="controlled-maib-order" name="orderNumber" pattern="R-[0-9]{4}-[0-9]{6}" placeholder="R-2026-000000" required />
          <input name="idempotencyKey" type="hidden" value={controlledIdempotencyKey} />
          <p className="mt-1 text-xs text-zinc-500">Finance-only governed acceptance order. Production MAIB credentials remain server-side.</p>
        </div>
        <button className="min-h-11 self-end rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={controlledPending}>
          {controlledPending ? "Creating checkout…" : "Create controlled MAIB checkout"}
        </button>
      </form>
      {controlled.status !== "IDLE" ? (
        <p className={`rounded-md p-3 text-sm ${controlled.status === "READY" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`} role="status">
          {controlled.outcome}{controlled.paymentAttemptId ? ` · ${controlled.paymentAttemptId}` : ""}
          {controlled.checkoutUrl ? <a className="ml-2 font-semibold underline" href={controlled.checkoutUrl} rel="noreferrer" target="_blank">Open MAIB hosted checkout</a> : null}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-[1500px] w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500"><tr><th className="p-2">Order / attempt</th><th className="p-2">Amount</th><th className="p-2">State</th><th className="p-2">Provider</th><th className="p-2">Payment ID / RRN</th><th className="p-2">Confirmed</th><th className="p-2">Reconciliation</th><th className="p-2">Refund</th><th className="p-2">Safe incident signal</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {payments.map((payment) => <tr key={payment.paymentAttemptId ?? payment.retailOrderId}>
              <td className="p-2"><div className="font-mono">{payment.orderNumber}</div><div className="font-mono text-xs text-zinc-500">{payment.paymentAttemptId ?? "—"}</div></td>
              <td className="p-2 tabular-nums">{payment.amount} {payment.currency}</td>
              <td className="p-2"><div className="font-semibold">{payment.paymentState}</div><div className="text-xs text-zinc-500">{payment.attemptStatus ?? "—"}</div></td>
              <td className="p-2"><div>{payment.provider ?? "—"}</div><div className="text-xs text-zinc-500">{payment.providerStatus ?? "—"}</div></td>
              <td className="p-2 font-mono text-xs"><div>{payment.providerPaymentId ?? "—"}</div><div>{payment.providerRrn ?? "—"}</div></td>
              <td className="p-2 text-xs">{payment.paymentConfirmedAt ?? "—"}</td>
              <td className="p-2 text-xs"><div>{payment.reconciliationLastOutcome ?? "—"}{payment.reconciliationLastAt ? ` · ${payment.reconciliationLastAt}` : ""}</div><div className="text-zinc-500">next {payment.reconciliationNextAt ?? "—"}</div></td>
              <td className="p-2 text-xs"><div>{payment.refundStatus ?? "—"} · {payment.remainingRefundable ?? "—"}</div><div className="font-mono text-zinc-500">{payment.providerRefundId ?? "—"}</div></td>
              <td className="p-2 text-xs">{payment.refundFailureCode ?? payment.failureCode ?? payment.reconciliationErrorCode ?? payment.lastProviderOutcome ?? payment.lastPaymentEventType ?? "—"}</td>
            </tr>)}
          </tbody>
        </table>
        {!payments.length ? <p className="p-4 text-sm text-zinc-500">No payment attempts.</p> : null}
      </div>
    </section>
  );
}

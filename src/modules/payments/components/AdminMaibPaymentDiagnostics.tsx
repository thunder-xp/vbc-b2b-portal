"use client";

import { useActionState } from "react";

import {
  type MaibConnectivityActionState,
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

export function AdminMaibPaymentDiagnostics({
  configuration,
  payments,
}: Readonly<{
  configuration: MaibConfigurationSummary;
  payments: RetailOrderPaymentState[];
}>) {
  const [connectivity, action, pending] = useActionState(verifyMaibConnectivityAdminAction, INITIAL);
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
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500"><tr><th className="p-2">Order</th><th className="p-2">Amount</th><th className="p-2">State</th><th className="p-2">Refund</th><th className="p-2">Remaining</th><th className="p-2">Payment ref</th><th className="p-2">Refund ref</th><th className="p-2">Timestamp / failure</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {payments.map((payment) => <tr key={payment.paymentAttemptId ?? payment.retailOrderId}>
              <td className="p-2 font-mono">{payment.orderNumber}</td>
              <td className="p-2 tabular-nums">{payment.amount} {payment.currency}</td>
              <td className="p-2 font-semibold">{payment.paymentState}</td>
              <td className="p-2">{payment.refundStatus ?? "—"}</td>
              <td className="p-2 tabular-nums">{payment.remainingRefundable ?? "—"}</td>
              <td className="p-2 font-mono text-xs">{payment.providerPaymentId ?? "—"}</td>
              <td className="p-2 font-mono text-xs">{payment.providerRefundId ?? "—"}</td>
              <td className="p-2 text-xs">{payment.refundConfirmedAt ?? payment.paymentConfirmedAt ?? payment.paymentCreatedAt ?? "—"}{payment.refundFailureCode ?? payment.failureCode ? ` · ${payment.refundFailureCode ?? payment.failureCode}` : ""}</td>
            </tr>)}
          </tbody>
        </table>
        {!payments.length ? <p className="p-4 text-sm text-zinc-500">No payment attempts.</p> : null}
      </div>
    </section>
  );
}

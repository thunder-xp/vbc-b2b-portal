"use client";

import { useActionState } from "react";

import {
  sendMoldcellSandboxTestAction,
  type MoldcellSandboxActionState,
} from "../actions/moldcell-sandbox.actions";
import type { MoldcellSmsReadiness } from "../gateway";

export function MoldcellSandboxTestPanel({ readiness }: { readiness: MoldcellSmsReadiness }) {
  const [state, action, pending] = useActionState(
    sendMoldcellSandboxTestAction,
    INITIAL_STATE,
  );
  const enabled = readiness.smsMode === "SANDBOX"
    && readiness.configuration.configured
    && readiness.identityConfigured
    && readiness.allowedRecipients.length > 0;
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-zinc-950">Moldcell SMS · sandbox</h2>
          <p className="mt-1 text-sm text-zinc-600">Только разрешённые внутренние номера. Массовые и Finance SMS отключены.</p>
        </div>
        <span className="border border-zinc-300 px-2 py-1 text-xs font-semibold text-zinc-700">
          {readiness.smsMode} · {readiness.configuration.configured ? "CONFIGURED" : "BLOCKED"}
        </span>
      </div>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <Detail label="Transport" value={readiness.configuration.transport} />
        <Detail label="Network" value={readiness.networkReachability} />
        <Detail label="Last accepted" value={readiness.stored.lastSandboxSuccess ?? "—"} />
        <Detail label="Last failure" value={readiness.stored.lastFailure ?? "—"} />
        <Detail label="Latency p50 / p95" value={`${readiness.stored.p50LatencyMs ?? "—"} / ${readiness.stored.p95LatencyMs ?? "—"} ms`} />
        <Detail label="Accepted / failed / retry" value={`${readiness.stored.acceptedCount} / ${readiness.stored.failedCount} / ${readiness.stored.retryCount}`} />
      </dl>
      <form action={action} className="mt-5 grid gap-3 sm:grid-cols-[minmax(220px,0.7fr)_minmax(280px,1fr)_auto] sm:items-end">
        <label className="grid gap-1 text-sm font-medium text-zinc-800">
          Разрешённый тестовый номер
          <select className="min-h-11 border border-zinc-300 bg-white px-3" disabled={!enabled || pending} name="recipientToken" required>
            <option value="">Выберите номер</option>
            {readiness.allowedRecipients.map((recipient) => (
              <option key={recipient.token} value={recipient.token}>{recipient.maskedPhone}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-800">
          Короткое тестовое сообщение
          <input className="min-h-11 border border-zinc-300 px-3" disabled={!enabled || pending} maxLength={Math.max(1, readiness.configuration.maxCharacters - 10)} name="message" placeholder="Проверка SMS-шлюза" required />
        </label>
        <button className="min-h-11 bg-zinc-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300" disabled={!enabled || pending} type="submit">
          {pending ? "Отправка…" : "Send Test SMS"}
        </button>
      </form>
      {state.message ? (
        <div className={`mt-4 border px-3 py-3 text-sm ${state.status === "accepted" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-red-300 bg-red-50 text-red-900"}`} role="status">
          <p className="font-semibold">{state.message}</p>
          {state.result ? (
            <dl className="mt-2 grid gap-2 sm:grid-cols-3">
              <Detail label="Provider / status" value={`${state.result.provider} · ${state.result.providerStatus}`} />
              <Detail label="Recipient" value={state.result.normalizedPhone} />
              <Detail label="Result code" value={state.result.providerCode ?? "—"} />
              <Detail label="Provider timestamp" value={state.result.providerTimestamp ?? "—"} />
              <Detail label="Attempt ID" value={state.result.attemptId ?? "—"} />
              <Detail label="Latency" value={`${state.result.durationMs} ms`} />
            </dl>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const INITIAL_STATE: MoldcellSandboxActionState = Object.freeze({
  status: "idle",
  message: null,
  result: null,
});

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-zinc-500">{label}</dt><dd className="mt-1 break-words font-medium text-zinc-950">{value}</dd></div>;
}

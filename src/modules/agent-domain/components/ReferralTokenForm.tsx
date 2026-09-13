"use client";

import { useActionState } from "react";

import { createReferralTokenAction, type ReferralTokenState } from "../actions";

const INITIAL_STATE: ReferralTokenState = { success: false, message: "" };

export function ReferralTokenForm({ agentId }: { agentId: string }) {
  const [state, action, pending] = useActionState(createReferralTokenAction, INITIAL_STATE);
  return (
    <form action={action} className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:grid-cols-[140px_1fr_auto]">
      <input name="agentId" type="hidden" value={agentId} />
      <label className="text-sm font-medium">Тип
        <select className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-3" name="tokenType" defaultValue="QR">
          <option value="QR">QR</option><option value="LINK">Ссылка</option>
        </select>
      </label>
      <label className="text-sm font-medium">Кампания (необязательно)
        <input className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-3" maxLength={120} name="campaignRef" />
      </label>
      <button className="mt-auto min-h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={pending} type="submit">Создать ссылку</button>
      {state.message ? <p className={state.success ? "text-sm text-emerald-800 sm:col-span-3" : "text-sm text-red-700 sm:col-span-3"} role="status">{state.message}</p> : null}
      {state.referralUrl ? <output className="break-all rounded-md bg-zinc-100 p-3 text-sm sm:col-span-3">{state.referralUrl}</output> : null}
    </form>
  );
}

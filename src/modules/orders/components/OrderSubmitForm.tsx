"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "../../access-control/actions/action-result";
import { submitCartOrderAction } from "../actions";
import type { PartnerOrder } from "../types";

const initial: ActionResult<PartnerOrder | null> = { success: true, errorCode: null, message: "", data: null };

export function OrderSubmitForm({ submissionKey }: { submissionKey: string }) {
  const [state, action, pending] = useActionState(submitCartOrderAction, initial);
  const [activeSubmissionKey, setActiveSubmissionKey] = useState(submissionKey);
  const router = useRouter();
  useEffect(() => { if (state.success && state.data?.id) router.push(`/cabinet/orders/${state.data.id}`); }, [router, state]);
  useEffect(() => {
    if (!state.success && state.message) setActiveSubmissionKey(crypto.randomUUID());
  }, [state]);
  return <form action={action} className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
    <input name="submissionKey" type="hidden" value={activeSubmissionKey} />
    <label className="block text-sm font-medium text-zinc-800">Желаемая дата отгрузки<input className="mt-1 block h-10 w-full rounded-md border border-zinc-300 px-3" min={new Date().toISOString().slice(0, 10)} name="requestedDeliveryDate" required type="date" /></label>
    <button className="h-11 w-full rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60" disabled={pending} type="submit">{pending ? "Создание заказа..." : "Подтвердить заказ"}</button>
    {state.message && <p aria-live="polite" className={`text-sm ${state.success ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p>}
  </form>;
}

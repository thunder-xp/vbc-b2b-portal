"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  confirmAgentRewardPayoutAction,
  type AgentRewardPayoutActionState,
} from "./actions";

const INITIAL_STATE: AgentRewardPayoutActionState = { status: "idle", message: "" };

export function PayoutConfirmationForm({
  amountLabel,
  expectedUpdatedAt,
  idempotencyKey,
  saleLinkId,
}: {
  amountLabel: string;
  expectedUpdatedAt: string;
  idempotencyKey: string;
  saleLinkId: string;
}) {
  const [state, action] = useActionState(confirmAgentRewardPayoutAction, INITIAL_STATE);
  return (
    <form action={action} className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-5">
      <input name="saleLinkId" type="hidden" value={saleLinkId} />
      <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <div>
        <h2 className="text-lg font-semibold">Подтверждение выплаты</h2>
        <p className="mt-1 text-sm text-zinc-700">
          Регистрируйте выплату только после фактического исполнения платёжного документа. Сумма {amountLabel} берётся из сохранённого расчёта и не редактируется.
        </p>
      </div>
      <label className="block text-sm font-medium">
        Номер платёжного документа / референс
        <input
          autoComplete="off"
          className="mt-1 h-11 w-full rounded-md border border-zinc-300 bg-white px-3"
          maxLength={160}
          name="payoutReference"
          required
        />
      </label>
      <label className="block text-sm font-medium">
        Внутреннее примечание (не показывается агенту)
        <textarea
          className="mt-1 min-h-24 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
          maxLength={1000}
          name="note"
        />
      </label>
      <label className="flex items-start gap-3 text-sm text-zinc-800">
        <input className="mt-1 size-4" name="confirmPayout" required type="checkbox" />
        Подтверждаю, что выплата агенту на сумму {amountLabel} фактически выполнена и указанный документ является её основанием.
      </label>
      {state.message ? (
        <p className={state.status === "success" ? "text-sm font-medium text-emerald-800" : "text-sm font-medium text-red-800"} role="status">
          {state.message}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="min-h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
      disabled={pending}
      type="submit"
    >
      {pending ? "Регистрируем…" : "Подтвердить фактическую выплату"}
    </button>
  );
}

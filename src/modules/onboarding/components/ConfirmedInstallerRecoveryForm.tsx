"use client";

import { useActionState } from "react";

import {
  recoverConfirmedInstallerOnboardingAction,
  type ConfirmedInstallerRecoveryActionState,
} from "../actions";

export function ConfirmedInstallerRecoveryForm() {
  const [state, action, pending] = useActionState<
    ConfirmedInstallerRecoveryActionState | null,
    FormData
  >(recoverConfirmedInstallerOnboardingAction, null);

  return (
    <section aria-labelledby="installer-recovery" className="rounded-lg border border-zinc-200 bg-white p-5">
      <h2 id="installer-recovery" className="text-lg font-semibold">Восстановление подтверждённой регистрации</h2>
      <p className="mt-2 max-w-3xl text-sm text-zinc-600">
        Создаёт только отсутствующий профиль и одну заявку в обычной очереди. Компания, членство, сопоставление и одобрение здесь не создаются.
      </p>
      <form action={action} className="mt-4 grid gap-4 md:grid-cols-2">
        <Field name="authUserId" label="Auth user UUID" />
        <Field name="companyName" label="Название компании" />
        <Field name="fiscalCode" label="Фискальный код" />
        <Field name="counterpartyExternal1cId" label="1C Ref_Key контрагента" />
        {state?.message ? (
          <p role={state.success ? "status" : "alert"} className={state.success ? "text-sm text-emerald-700 md:col-span-2" : "text-sm text-rose-700 md:col-span-2"}>
            {state.message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-60 md:col-span-2 md:w-fit"
        >
          {pending ? "Восстановление…" : "Восстановить в очередь"}
        </button>
      </form>
    </section>
  );
}

function Field({ name, label }: { name: string; label: string }) {
  return (
    <label className="grid gap-1 text-sm font-medium text-zinc-800">
      {label}
      <input name={name} required className="min-h-11 rounded-md border border-zinc-300 px-3 font-normal" />
    </label>
  );
}

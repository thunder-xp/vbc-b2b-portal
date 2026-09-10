"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import {
  purgeFailedRegistrationAction,
  type FailedRegistrationPurgeActionState,
} from "../actions/failed-registration-purge.actions";
import type { FailedRegistrationPurgeReadiness } from "../types";

export function FailedRegistrationPurgeControl({
  readiness,
}: {
  readiness: FailedRegistrationPurgeReadiness;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [state, action, pending] = useActionState<
    FailedRegistrationPurgeActionState | null,
    FormData
  >(purgeFailedRegistrationAction, null);

  useEffect(() => {
    if (!state?.success) return;
    router.replace("/admin/onboarding?registrationReset=1");
    router.refresh();
  }, [router, state]);

  if (!readiness.eligible || !readiness.userId || !readiness.email
    || !readiness.applicationName) {
    return null;
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-rose-300 px-4 text-sm font-semibold text-rose-800 hover:bg-rose-50"
      >
        <Trash2 className="size-4" aria-hidden />
        Сбросить регистрацию
      </button>
    );
  }

  return (
    <form action={action} className="space-y-4 border-l-4 border-rose-500 bg-rose-50 p-4">
      <input type="hidden" name="requestId" value={readiness.requestId} />
      <input type="hidden" name="userId" value={readiness.userId} />
      <input type="hidden" name="email" value={readiness.email} />
      <input type="hidden" name="applicationName" value={readiness.applicationName} />

      <div className="flex gap-3 text-rose-950">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div>
          <h3 className="font-semibold">Необратимый сброс регистрации</h3>
          <p className="mt-2 text-sm">
            Пользователь и незавершённая регистрация будут удалены. После этого этот email сможет зарегистрироваться заново.
          </p>
        </div>
      </div>

      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="text-rose-700">Email</dt>
          <dd className="break-all font-semibold text-rose-950">{readiness.email}</dd>
        </div>
        <div>
          <dt className="text-rose-700">Компания / заявка</dt>
          <dd className="font-semibold text-rose-950">{readiness.applicationName}</dd>
        </div>
      </dl>

      <label className="grid gap-1 text-sm font-medium text-rose-950">
        Введите точный email для подтверждения
        <input
          name="confirmationEmail"
          type="email"
          required
          autoComplete="off"
          className="min-h-11 rounded-md border border-rose-300 bg-white px-3 text-zinc-950"
        />
      </label>
      <label className="flex min-h-11 items-start gap-3 text-sm text-rose-950">
        <input name="confirmed" type="checkbox" required className="mt-1 size-4" />
        <span>Подтверждаю удаление только этой незавершённой регистрации.</span>
      </label>

      {state?.message ? (
        <p
          role={state.success ? "status" : "alert"}
          className={state.success ? "text-sm text-emerald-800" : "text-sm font-medium text-rose-900"}
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-60"
        >
          {pending ? "Выполняется сброс..." : "Удалить регистрацию"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setExpanded(false)}
          className="min-h-11 rounded-md border border-rose-300 px-4 text-sm font-semibold text-rose-900 hover:bg-white disabled:opacity-60"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}

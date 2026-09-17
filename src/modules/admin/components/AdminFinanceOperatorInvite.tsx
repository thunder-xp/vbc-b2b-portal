"use client";

import { useActionState } from "react";

import {
  inviteFinanceOperatorAction,
  type FinanceOperatorInviteActionState,
} from "../actions";

const initialState: FinanceOperatorInviteActionState = {
  status: "idle",
  requestId: null,
  authUserId: null,
};

export function AdminFinanceOperatorInvite() {
  const [state, action, pending] = useActionState(inviteFinanceOperatorAction, initialState);
  return (
    <section className="border border-zinc-200 bg-white p-5" aria-labelledby="finance-operator-invite-title">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Внутренний доступ</p>
        <h2 className="mt-1 text-lg font-semibold" id="finance-operator-invite-title">Пригласить финансового оператора</h2>
        <p className="mt-1 text-sm text-zinc-600">
          После подтверждения email пользователь получит только существующую роль novotech_finance.
        </p>
      </div>
      <form action={action} className="grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_minmax(14rem,1fr)_minmax(16rem,1.4fr)_auto]">
        <label className="grid gap-1 text-sm font-medium">
          Имя
          <input className="min-h-11 border border-zinc-300 px-3" maxLength={160} minLength={2} name="displayName" required />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Email
          <input autoComplete="off" className="min-h-11 border border-zinc-300 px-3" maxLength={320} name="email" required type="email" />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Основание
          <input className="min-h-11 border border-zinc-300 px-3" maxLength={500} minLength={3} name="reason" required />
        </label>
        <button className="min-h-11 self-end bg-zinc-950 px-4 text-sm font-semibold text-white disabled:bg-zinc-400" disabled={pending}>
          {pending ? "Отправка…" : "Пригласить"}
        </button>
      </form>
      {state.status === "invited" ? (
        <p className="mt-3 text-sm font-medium text-emerald-700" role="status">
          Приглашение передано в Supabase Auth. Доступ активируется только после подтверждения пользователем.
        </p>
      ) : null}
      {state.status === "existing" ? (
        <p className="mt-3 text-sm text-amber-800" role="status">Для этого email уже существует открытая заявка.</p>
      ) : null}
      {state.status === "error" ? (
        <p className="mt-3 text-sm text-red-700" role="alert">Приглашение не создано. Проверьте данные и журнал доступа.</p>
      ) : null}
    </section>
  );
}

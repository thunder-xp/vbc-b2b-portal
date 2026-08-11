"use client";

import { useActionState } from "react";

import { registerFromCompanyInvitationAction } from "../actions/invitation-registration.actions";

export function InvitationRegisterForm({ token, fullName, email }: {
  token: string;
  fullName: string;
  email: string;
}) {
  const [state, action, pending] = useActionState(
    registerFromCompanyInvitationAction.bind(null, token),
    { error: null },
  );
  return (
    <form action={action} className="mt-6 grid gap-4">
      <Field autoComplete="name" defaultValue={fullName} label="Имя" name="fullName" />
      <label className="grid gap-2 text-sm font-medium text-zinc-800">
        Email
        <input className="h-11 rounded-md border border-zinc-200 bg-zinc-100 px-3 text-zinc-600" disabled value={email} />
      </label>
      <Field autoComplete="new-password" label="Пароль" name="password" type="password" />
      <Field autoComplete="new-password" label="Подтверждение пароля" name="confirmPassword" type="password" />
      {state.error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">Не удалось создать аккаунт. Проверьте данные и повторите попытку.</p> : null}
      <button className="h-11 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white disabled:bg-zinc-400" disabled={pending}>
        {pending ? "Создаём аккаунт..." : "Создать аккаунт"}
      </button>
    </form>
  );
}

function Field({ label, name, type = "text", ...props }: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
}) {
  return <label className="grid gap-2 text-sm font-medium text-zinc-800">{label}<input {...props} className="h-11 rounded-md border border-zinc-300 px-3 outline-none focus:border-emerald-700" name={name} required type={type} /></label>;
}

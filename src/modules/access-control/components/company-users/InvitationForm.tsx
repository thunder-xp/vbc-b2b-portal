"use client";

import { useActionState } from "react";

import {
  createEmployeeInvitationAction,
  type CompanyUserMutationState,
} from "../../actions/company-users.actions";

const INITIAL_STATE: CompanyUserMutationState = {
  success: false,
  message: null,
  invitationUrl: null,
};

export function InvitationForm({ companyId }: { companyId?: string }) {
  const [state, action, pending] = useActionState(
    createEmployeeInvitationAction,
    INITIAL_STATE,
  );

  return (
    <form action={action} className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-zinc-950">Пригласить сотрудника</h2>
        <p className="mt-1 text-sm text-zinc-600">Сотрудник сам создаст или войдёт в свою учётную запись.</p>
      </div>
      {companyId ? <input name="companyId" type="hidden" value={companyId} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Имя сотрудника" name="fullName" />
        <Field label="Электронная почта" name="email" type="email" />
        <label className="grid gap-2 text-sm font-medium text-zinc-800">
          Роль
          <select className="h-11 rounded-md border border-zinc-300 bg-white px-3" defaultValue="partner_viewer" name="roleCode">
            <option value="partner_manager">Менеджер</option>
            <option value="partner_buyer">Закупки</option>
            <option value="partner_accounting">Бухгалтерия</option>
            <option value="partner_viewer">Просмотр</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium text-zinc-800">
          Доступ к ценам
          <select className="h-11 rounded-md border border-zinc-300 bg-white px-3" defaultValue="full" name="priceAccess">
            <option value="full">Партнёрские и розничные цены</option>
            <option value="retail_only">Только розничные цены</option>
          </select>
        </label>
      </div>
      <AccessSummary />
      {state.message ? (
        <p className={`rounded-md px-3 py-2 text-sm ${state.success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
          {state.message}
        </p>
      ) : null}
      {state.invitationUrl ? (
        <label className="grid gap-2 text-sm font-medium text-amber-900">
          Одноразовая ссылка. Покажется только сейчас.
          <input className="h-11 min-w-0 rounded-md border border-amber-300 bg-amber-50 px-3 font-mono text-xs" readOnly value={state.invitationUrl} />
        </label>
      ) : null}
      <button className="h-11 justify-self-start rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white disabled:bg-zinc-400" disabled={pending}>
        {pending ? "Создаём приглашение..." : "Пригласить сотрудника"}
      </button>
    </form>
  );
}

function Field({ label, name, type = "text" }: { label: string; name: string; type?: string }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-zinc-800">
      {label}
      <input className="h-11 rounded-md border border-zinc-300 px-3" name={name} required type={type} />
    </label>
  );
}

function AccessSummary() {
  return (
    <div className="rounded-md bg-zinc-50 p-3 text-xs text-zinc-600">
      <p className="font-semibold text-zinc-800">Доступ сотрудника</p>
      <p className="mt-1">Цены, заказы, финансы, сметы и управление пользователями определяются выбранной ролью. Ограничение партнёрских цен применяется как отдельный запрет.</p>
    </div>
  );
}

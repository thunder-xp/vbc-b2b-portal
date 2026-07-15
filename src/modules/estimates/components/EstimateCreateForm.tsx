"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createEstimateAction } from "../actions";

export function EstimateCreateForm({ currencies }: { currencies: string[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await createEstimateAction({
            name: String(form.get("name") ?? ""),
            customerName: String(form.get("customerName") ?? ""),
            projectName: String(form.get("projectName") ?? ""),
            currencyCode: String(form.get("currencyCode") ?? ""),
            validityDays: Number(form.get("validityDays")),
          });
          setMessage(result.message);
          if (result.success) router.push(`/cabinet/estimates/${result.data.id}`);
        });
      }}
    >
      <Field label="Название сметы" name="name" placeholder="Видеонаблюдение для склада" required />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Заказчик" name="customerName" placeholder="Необязательно" />
        <Field label="Проект / объект" name="projectName" placeholder="Необязательно" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-zinc-800">
          Валюта
          <select className="mt-2 h-11 w-full rounded-md border border-zinc-300 bg-white px-3 outline-none focus:border-emerald-600" disabled={!currencies.length} name="currencyCode" required>
            {currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-zinc-800">
          Срок действия, дней
          <input className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 outline-none focus:border-emerald-600" defaultValue={14} max={365} min={1} name="validityDays" required type="number" />
        </label>
      </div>
      {!currencies.length && <p className="text-sm text-amber-800">Нет доступной опубликованной валюты. Обновите коммерческие данные.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button className="rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={pending || !currencies.length} type="submit">
          {pending ? "Создание..." : "Создать смету"}
        </button>
        {message && <p aria-live="polite" className="text-sm text-zinc-600">{message}</p>}
      </div>
    </form>
  );
}

function Field({ label, name, placeholder, required = false }: { label: string; name: string; placeholder: string; required?: boolean }) {
  return (
    <label className="text-sm font-medium text-zinc-800">
      {label}
      <input className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 outline-none focus:border-emerald-600" maxLength={200} name={name} placeholder={placeholder} required={required} />
    </label>
  );
}

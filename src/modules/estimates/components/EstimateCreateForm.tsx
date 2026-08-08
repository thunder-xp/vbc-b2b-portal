"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import { ActionFeedback, actionClassName, FormField } from "../../platform-ui";
import { createEstimateAction } from "../actions/estimate.actions";
import { FinalCustomerPicker } from "./FinalCustomerPicker";

export function EstimateCreateForm({ currencies }: { currencies: string[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [finalCustomerId, setFinalCustomerId] = useState<string | null>(null);
  const requestKey = useRef(crypto.randomUUID());

  return (
    <form
      className="space-y-5"
      onChange={() => { requestKey.current = crypto.randomUUID(); }}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await createEstimateAction({
            name: String(form.get("name") ?? ""),
            finalCustomerId,
            projectName: String(form.get("projectName") ?? ""),
            currencyCode: String(form.get("currencyCode") ?? ""),
            validityDays: Number(form.get("validityDays")),
            requestKey: requestKey.current,
          });
          setMessage(result.message);
          if (result.success) {
            recordBehaviorInteraction({ eventName: "estimate_created", route: "/cabinet/estimates/new", sourceSurface: "estimate_create" });
            router.push(`/cabinet/estimates/${result.data.id}`);
          }
        });
      }}
    >
      <Field label="Название сметы" name="name" placeholder="Видеонаблюдение для склада" required />
      <FinalCustomerPicker onChange={(customer) => setFinalCustomerId(customer?.id ?? null)} value={finalCustomerId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Проект / объект" name="projectName" placeholder="Необязательно" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Валюта" required>{(props) =>
          <select {...props} className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 outline-none focus:border-emerald-600" disabled={!currencies.length} name="currencyCode" required>
            {currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
          </select>}</FormField>
        <FormField helperText="От 1 до 365 дней." label="Срок действия, дней" required>{(props) => <input {...props} className="h-11 w-full rounded-md border border-zinc-300 px-3 outline-none focus:border-emerald-600" defaultValue={14} max={365} min={1} name="validityDays" required type="number" />}</FormField>
      </div>
      {!currencies.length && <p className="text-sm text-amber-800">Нет доступной опубликованной валюты. Обновите коммерческие данные.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button className={actionClassName.primary} disabled={pending || !currencies.length || !finalCustomerId} type="submit">
          {pending ? "Создание..." : "Создать смету"}
        </button>
        {message && <ActionFeedback kind={message === "Смета создана." ? "success" : "error"} message={message === "Смета создана." ? message : `${message} Введённые данные сохранены.`} />}
      </div>
    </form>
  );
}

function Field({ label, name, placeholder, required = false }: { label: string; name: string; placeholder: string; required?: boolean }) {
  return (
    <FormField label={label} required={required}>{(props) => <input {...props} className="h-11 w-full rounded-md border border-zinc-300 px-3 outline-none focus:border-emerald-600" maxLength={200} name={name} placeholder={placeholder} required={required} />}</FormField>
  );
}

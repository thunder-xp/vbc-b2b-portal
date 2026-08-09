"use client";

import { Plus, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createFinalCustomerAction, updateFinalCustomerAction } from "../actions";
import { FINAL_CUSTOMER_INDUSTRIES, type FinalCustomer, type FinalCustomerIndustryCode, type FinalCustomerType } from "../types";
import { DirectoryEditorDialog } from "./DirectoryEditorDialog";

const controlClass = "min-h-11 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200";

export function FinalCustomerDialog({ customer = null, label }: { customer?: FinalCustomer | null; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [customerType, setCustomerType] = useState<FinalCustomerType>(customer?.customerType ?? "company");
  const [industryCode, setIndustryCode] = useState<FinalCustomerIndustryCode | "">(customer?.industryCode ?? "");

  return <>
    <button className={customer ? "inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700" : "inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white"} onClick={() => { setMessage(null); setOpen(true); }} type="button">{customer ? null : <Plus className="size-4" />}{label ?? (customer ? "Изменить" : "Добавить заказчика")}</button>
    {open ? <DirectoryEditorDialog description="Данные доступны только участникам активной компании." onClose={() => setOpen(false)} title={customer ? "Изменить заказчика" : "Новый заказчик"}>
      <form className="grid min-w-0 gap-4 p-5 sm:grid-cols-2" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const input = {
          displayName: String(form.get("displayName") ?? ""), customerType,
          fiscalCode: String(form.get("fiscalCode") ?? ""), locality: String(form.get("locality") ?? ""),
          industryCode: industryCode || null,
        };
        startTransition(async () => {
          const result = customer ? await updateFinalCustomerAction(customer.id, customer.revision, input) : await createFinalCustomerAction(input);
          setMessage(result.message);
          if (result.success) { setOpen(false); router.refresh(); }
        });
      }}>
        <Field label="Заказчик"><input className={controlClass} defaultValue={customer?.displayName ?? ""} maxLength={200} name="displayName" required /></Field>
        <Field label="Тип"><select className={controlClass} onChange={(event) => setCustomerType(event.target.value as FinalCustomerType)} value={customerType}><option value="company">Компания</option><option value="individual">Физическое лицо</option></select></Field>
        <Field label="IDNO"><input className={controlClass} defaultValue={customer?.fiscalCode ?? ""} maxLength={32} name="fiscalCode" /></Field>
        <Field label="Город / регион"><input className={controlClass} defaultValue={customer?.locality ?? ""} maxLength={120} name="locality" /></Field>
        <Field className="sm:col-span-2" label="Отрасль"><select className={controlClass} onChange={(event) => setIndustryCode(event.target.value as FinalCustomerIndustryCode | "")} value={industryCode}><option value="">Не указана</option>{FINAL_CUSTOMER_INDUSTRIES.map((industry) => <option key={industry.code} value={industry.code}>{industry.label}</option>)}</select></Field>
        {message ? <p aria-live="polite" className="text-sm text-red-700 sm:col-span-2">{message}</p> : null}
        <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200 pt-4 sm:col-span-2"><button className="min-h-11 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold" onClick={() => setOpen(false)} type="button">Отмена</button><button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={pending} type="submit"><Save className="size-4" />{pending ? "Сохранение..." : "Сохранить"}</button></div>
      </form>
    </DirectoryEditorDialog> : null}
  </>;
}

function Field({ children, className = "", label }: { children: React.ReactNode; className?: string; label: string }) { return <label className={`grid min-w-0 gap-1 text-sm font-medium text-zinc-700 ${className}`}>{label}{children}</label>; }

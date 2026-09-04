"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  submitOnboardingPartnerRevisionAction,
  type OnboardingWorkflowActionState,
} from "../actions";
import type { PartnerOnboardingStatusCenter } from "../types";

const initialState: OnboardingWorkflowActionState = { success: true, errorCode: null, message: "", data: null };

export function OnboardingCorrectionForm({ center }: { center: PartnerOnboardingStatusCenter }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(submitOnboardingPartnerRevisionAction, initialState);
  useEffect(() => {
    if (state.success && state.message) router.replace("/onboarding/waiting");
  }, [router, state]);
  const requested = new Set(center.requestedFields);
  const values = center.currentValues;

  return (
    <main className="app-responsive-surface min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950 sm:px-6 sm:py-12">
      <div className="app-onboarding-flow mx-auto w-full">
        <header className="border-b border-zinc-200 pb-5">
          <p className="text-sm font-semibold uppercase text-emerald-700">Уточнение заявки</p>
          <h1 className="mt-2 text-2xl font-semibold">Дополнить заявку</h1>
          <p className="mt-2 text-sm text-zinc-600">Изменения создадут новую редакцию. Предыдущая редакция останется в истории.</p>
        </header>
        <form action={action} className="mt-6 grid gap-5 bg-white pb-6 sm:grid-cols-2">
          <input type="hidden" name="expectedRevision" value={center.revisionNumber} />
          <Field name="companyName" label="Название компании" value={values.companyName} requested={requested.has("company_name")} required />
          <Field name="fiscalCode" label="Фискальный код" value={values.fiscalCode} requested={requested.has("fiscal_code")} />
          <Field name="contactName" label="Контактное лицо" value={values.contactName} requested={requested.has("contact_name")} required />
          <Field name="phone" label="Телефон" value={values.phone} requested={requested.has("phone")} required />
          <Field name="email" type="email" label="Электронная почта" value={values.email} requested={requested.has("email")} required />
          <Field name="locality" label="Населённый пункт" value={values.locality} requested={requested.has("locality")} />
          <Field name="businessType" label="Тип бизнеса" value={values.businessType} requested={requested.has("business_type")} />
          <Field name="estimatedPurchasingVolume" label="Ожидаемый объём закупок" value={values.estimatedPurchasingVolume} requested={requested.has("estimated_purchasing_volume")} />
          <TextField name="businessActivity" label="Направление деятельности" value={values.businessActivity} requested={requested.has("business_activity")} maxLength={1000} />
          <TextField name="comment" label="Комментарий" value={values.comment} requested={requested.has("comment")} maxLength={2000} />
          <div className="sm:col-span-2">
            {state.message ? <p role="status" className={state.success ? "text-sm text-emerald-700" : "text-sm text-red-700"}>{state.message}</p> : null}
            <button disabled={pending} className="mt-3 min-h-11 w-full bg-emerald-700 px-5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto">
              {pending ? "Отправка..." : "Отправить обновлённую заявку"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function Field({ name, label, value, requested, required, type = "text" }: { name: string; label: string; value: string | null; requested: boolean; required?: boolean; type?: string }) {
  return (
    <label className={`grid gap-1 text-sm font-medium ${requested ? "border-l-4 border-amber-500 pl-3" : ""}`}>
      {label}{requested ? <span className="text-xs font-normal text-amber-800">Требуется уточнить</span> : null}
      <input name={name} type={type} defaultValue={value ?? ""} required={required} maxLength={254} className="min-h-11 border border-zinc-300 px-3" />
    </label>
  );
}

function TextField({ name, label, value, requested, maxLength }: { name: string; label: string; value: string | null; requested: boolean; maxLength: number }) {
  return (
    <label className={`grid gap-1 text-sm font-medium sm:col-span-2 ${requested ? "border-l-4 border-amber-500 pl-3" : ""}`}>
      {label}{requested ? <span className="text-xs font-normal text-amber-800">Требуется уточнить</span> : null}
      <textarea name={name} defaultValue={value ?? ""} maxLength={maxLength} rows={4} className="border border-zinc-300 p-3" />
    </label>
  );
}

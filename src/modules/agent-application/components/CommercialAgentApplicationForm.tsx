"use client";

import { cloneElement, type ReactElement, useActionState, useState } from "react";

import type { PublicLocale } from "@/src/modules/public-locale";

import {
  submitCommercialAgentApplicationAction,
  type CommercialAgentApplicationActionState,
} from "../actions";
import { applicationStatusCopy, commercialAgentApplicationCopy } from "../presentation";
import type { CommercialAgentApplication } from "../types";

const initialActionState: CommercialAgentApplicationActionState = {
  success: false,
  message: null,
  application: null,
};

export function CommercialAgentApplicationForm({
  application,
  locale,
}: {
  application: CommercialAgentApplication;
  locale: PublicLocale;
}) {
  const copy = commercialAgentApplicationCopy[locale];
  const [state, formAction, isPending] = useActionState(submitCommercialAgentApplicationAction, initialActionState);
  const current = state.application ?? application;
  const [agentType, setAgentType] = useState(current.agentType);

  if (current.status !== "DRAFT" && current.status !== "NEEDS_CLARIFICATION") {
    const status = applicationStatusCopy(current.status, locale);
    return (
      <section aria-live="polite" className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
        <h2 className="text-lg font-semibold text-emerald-950">{status.title}</h2>
        <p className="mt-1 text-sm leading-6 text-emerald-900">{status.description}</p>
        {current.applicantVisibleNote ? <p className="mt-3 border-l-2 border-emerald-600 pl-3 text-sm text-zinc-700">{current.applicantVisibleNote}</p> : null}
      </section>
    );
  }

  const clarification = current.status === "NEEDS_CLARIFICATION" ? applicationStatusCopy(current.status, locale) : null;
  return (
    <form action={formAction} className="grid gap-4">
      {clarification ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3" role="status">
          <p className="font-semibold text-amber-950">{clarification.title}</p>
          <p className="mt-1 text-sm text-amber-900">{current.applicantVisibleNote ?? clarification.description}</p>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={copy.displayName} marker={copy.required}>
          <input autoComplete="name" defaultValue={current.displayName ?? ""} maxLength={200} name="displayName" required />
        </Field>
        <Field label={copy.agentType} marker={copy.required}>
          <select name="agentType" onChange={(event) => setAgentType(event.target.value as typeof agentType)} value={agentType}>
            <option value="INDIVIDUAL">{copy.individual}</option>
            <option value="LEGAL_ENTITY">{copy.legalEntity}</option>
          </select>
        </Field>
        {agentType === "LEGAL_ENTITY" ? (
          <Field className="sm:col-span-2" label={copy.legalName} marker={copy.required}>
            <input defaultValue={current.legalName ?? ""} maxLength={240} name="legalName" required />
          </Field>
        ) : <input name="legalName" type="hidden" value="" />}
        <Field label={copy.phone} marker={copy.required}>
          <input autoComplete="tel" defaultValue={current.phone ?? ""} inputMode="tel" maxLength={32} minLength={8} name="phone" required type="tel" />
        </Field>
        <Field label={copy.email} marker={copy.required}>
          <input autoComplete="email" className="bg-zinc-50 text-zinc-600" defaultValue={current.email ?? ""} maxLength={254} name="email" readOnly required type="email" />
        </Field>
        <Field label={copy.locality} marker={copy.optional}>
          <input autoComplete="address-level2" defaultValue={current.locality ?? ""} maxLength={120} name="locality" />
        </Field>
        <Field label={copy.profession} marker={copy.optional}>
          <input autoComplete="organization-title" defaultValue={current.profession ?? ""} maxLength={160} name="profession" />
        </Field>
        <Field className="sm:col-span-2" label={copy.workplace} marker={copy.optional}>
          <input autoComplete="organization" defaultValue={current.workplace ?? ""} maxLength={200} name="workplace" />
        </Field>
      </div>
      {!state.success && state.message ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {localizedError(state.message, locale)}
        </p>
      ) : null}
      <button className="min-h-11 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:bg-zinc-400" disabled={isPending} type="submit">
        {isPending ? copy.submitting : current.status === "NEEDS_CLARIFICATION" ? copy.resubmit : copy.submit}
      </button>
    </form>
  );
}

function Field({ children, className = "", label, marker }: { children: ReactElement<{ className?: string }>; className?: string; label: string; marker: string }) {
  return (
    <label className={`grid gap-1.5 text-sm font-medium text-zinc-800 ${className}`}>
      <span>{label} <span className="text-xs font-normal text-zinc-500">({marker})</span></span>
      {cloneElement(children, { className: `min-h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 ${children.props.className ?? ""}` })}
    </label>
  );
}

function localizedError(message: string, locale: PublicLocale) {
  if (message === "APPLICATION_SUBMISSION_FAILED") {
    return locale === "ru" ? "Не удалось отправить заявку. Попробуйте ещё раз." : "Cererea nu a putut fi trimisă. Încercați din nou.";
  }
  const errors: Record<string, [string, string]> = {
    "Укажите имя или публичное название.": ["Укажите имя или публичное название.", "Indicați numele sau denumirea publică."],
    "Введите корректный email.": ["Введите корректный email.", "Introduceți un email corect."],
    "Укажите корректный номер телефона.": ["Укажите корректный номер телефона.", "Indicați un număr de telefon corect."],
    "Укажите юридическое наименование.": ["Укажите юридическое наименование.", "Indicați denumirea juridică."],
    "Значение слишком длинное.": ["Значение слишком длинное.", "Valoarea este prea lungă."],
  };
  return errors[message]?.[locale === "ru" ? 0 : 1]
    ?? (locale === "ru" ? "Проверьте обязательные поля." : "Verificați câmpurile obligatorii.");
}

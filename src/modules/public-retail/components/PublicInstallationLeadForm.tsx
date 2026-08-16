"use client";

import { AlertCircle, CheckCircle2, LoaderCircle, Send } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { submitPublicInstallationLeadAction, type InstallationLeadActionState } from "../actions/installation-lead.actions";
import type { PublicRetailLocale } from "../types";
import { PublicLocalityField } from "./PublicLocalityField";

const initialState: InstallationLeadActionState = { status: "idle", message: "" };
const inputClass = "mt-1 min-h-11 w-full border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100";

export function PublicInstallationLeadForm({ locale, objectType, systemType, sourcePath, submissionKey }: {
  locale: PublicRetailLocale;
  objectType: string;
  systemType: string;
  sourcePath: string;
  submissionKey: string;
}) {
  const [state, action] = useActionState(submitPublicInstallationLeadAction, initialState);
  const ru = locale === "ru";
  if (state.status === "success") return <div aria-live="polite" className="border-l-4 border-emerald-600 bg-emerald-50 p-5 text-sm leading-6 text-emerald-950"><CheckCircle2 aria-hidden="true" className="mb-3 size-6" />{state.message}</div>;
  return <form action={action} className="grid gap-4" noValidate={false}>
    <input name="locale" type="hidden" value={locale} />
    <input name="sourcePath" type="hidden" value={sourcePath} />
    <input name="submissionKey" type="hidden" value={submissionKey} />
      <input aria-hidden="true" autoComplete="off" className="absolute -left-[10000px]" name="website" tabIndex={-1} />
    {state.status === "error" ? <div aria-live="assertive" className="flex gap-3 border-l-4 border-red-600 bg-red-50 p-4 text-sm text-red-900" role="alert"><AlertCircle aria-hidden="true" className="size-5 shrink-0" />{state.message}</div> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={ru ? "Имя" : "Nume"}><input autoComplete="name" className={inputClass} maxLength={120} minLength={2} name="name" required /></Field>
      <Field label={ru ? "Телефон" : "Telefon"}><input autoComplete="tel" className={inputClass} inputMode="tel" maxLength={30} name="phone" placeholder="+373 60 000 000" required /></Field>
      <PublicLocalityField locale={locale} />
      <Field label={ru ? "Тип объекта" : "Tipul obiectivului"}><select className={inputClass} defaultValue={safeObjectType(objectType)} name="objectType" required>
        <option value="apartment">{ru ? "Квартира" : "Apartament"}</option><option value="house">{ru ? "Дом" : "Casă"}</option><option value="office">{ru ? "Офис" : "Oficiu"}</option><option value="retail">{ru ? "Магазин / HoReCa" : "Magazin / HoReCa"}</option><option value="warehouse">{ru ? "Склад" : "Depozit"}</option><option value="production">{ru ? "Производство" : "Producție"}</option><option value="other">{ru ? "Другой объект" : "Alt obiectiv"}</option>
      </select></Field>
      <Field label={ru ? "Система" : "Sistem"}><select className={inputClass} defaultValue={safeSystemType(systemType)} name="systemType" required>
        <option value="cctv">{ru ? "Видеонаблюдение" : "Supraveghere video"}</option><option value="access_control">{ru ? "Контроль доступа" : "Control acces"}</option><option value="alarm">{ru ? "Охранная сигнализация" : "Alarmă antiefracție"}</option><option value="intercom">{ru ? "Домофония" : "Interfonie"}</option><option value="network">{ru ? "Сеть / Wi-Fi" : "Rețea / Wi-Fi"}</option><option value="other">{ru ? "Другая система" : "Alt sistem"}</option>
      </select></Field>
      <Field className="sm:col-span-2" label={ru ? "Комментарий (необязательно)" : "Comentariu (opțional)"}><textarea className={`${inputClass} min-h-24 py-3`} maxLength={1000} name="comment" /></Field>
    </div>
    <label className="flex min-h-11 items-start gap-3 text-sm leading-6 text-zinc-700"><input className="mt-1 size-5 shrink-0 accent-blue-700" name="consent" required type="checkbox" /><span>{ru ? "Согласен на обработку контактных данных для ответа на заявку." : "Sunt de acord cu prelucrarea datelor de contact pentru soluționarea cererii."}</span></label>
    <SubmitButton ru={ru} />
  </form>;
}

function SubmitButton({ ru }: { ru: boolean }) { const { pending } = useFormStatus(); return <button className="inline-flex min-h-12 items-center justify-center gap-2 bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60" disabled={pending} type="submit">{pending ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <Send aria-hidden="true" className="size-5" />}{pending ? (ru ? "Отправляем…" : "Se trimite…") : (ru ? "Получить консультацию" : "Solicită consultanță")}</button>; }
function Field({ children, className = "", label }: { children: React.ReactNode; className?: string; label: string }) { return <label className={`text-sm font-medium text-zinc-800 ${className}`}>{label}{children}</label>; }
function safeObjectType(value: string) { return ["apartment", "house", "office", "retail", "warehouse", "production", "other"].includes(value) ? value : "other"; }
function safeSystemType(value: string) { return ["cctv", "access_control", "alarm", "intercom", "network", "other"].includes(value) ? value : "cctv"; }

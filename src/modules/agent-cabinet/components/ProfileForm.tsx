"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";

import { updateAgentProfileAction, type ProfileActionState } from "../actions";
import type { AgentCabinetContext } from "../types";
import type { AgentCabinetLocale } from "../copy";
import { primaryButton } from "./PageHeader";

export function ProfileForm({ context, locale }: { context: AgentCabinetContext; locale: AgentCabinetLocale }) {
  const [state, action, pending] = useActionState<ProfileActionState, FormData>(updateAgentProfileAction, { success: false, message: "" });
  const ro = locale === "ro";
  const message = state.message ? (state.success
    ? (ro ? "Profilul a fost salvat." : "Профиль сохранён.")
    : (ro ? "Profilul nu a putut fi salvat. Verificați datele." : "Не удалось сохранить профиль. Проверьте данные.")) : "";
  return <form action={action} className="grid gap-4 border border-zinc-200 bg-white p-5 sm:grid-cols-2">
    <Field defaultValue={context.phone ?? ""} label={ro ? "Telefon" : "Телефон"} name="phone"/><Field defaultValue={context.email ?? ""} label="Email" name="email" type="email"/>
    <Field defaultValue={context.locality ?? ""} label={ro ? "Localitate" : "Населённый пункт"} name="locality"/><Field defaultValue={context.profession ?? ""} label={ro ? "Profesie" : "Профессия"} name="profession"/>
    <div className="sm:col-span-2"><Field defaultValue={context.workplace ?? ""} label={ro ? "Loc de muncă" : "Место работы"} name="workplace"/></div>
    {message ? <p className={`text-sm sm:col-span-2 ${state.success ? "text-emerald-700" : "text-red-700"}`} role="status">{message}</p> : null}
    <button className={`${primaryButton} sm:col-span-2 sm:justify-self-start`} disabled={pending} type="submit"><Save size={18}/>{pending ? (ro ? "Se salvează…" : "Сохранение…") : (ro ? "Salvează" : "Сохранить")}</button>
  </form>;
}

function Field({ label, name, defaultValue, type = "text" }: { label: string; name: string; defaultValue: string; type?: string }) { return <label className="block text-sm font-medium">{label}<input className="mt-1 min-h-11 w-full border border-zinc-300 px-3 outline-none focus:border-emerald-700" defaultValue={defaultValue} name={name} type={type}/></label>; }

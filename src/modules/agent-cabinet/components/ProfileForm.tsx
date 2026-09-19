"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";

import { updateAgentProfileAction, type ProfileActionState } from "../actions";
import type { AgentCabinetContext } from "../types";
import type { AgentCabinetLocale } from "../copy";
import { CabinetFeedback, cabinetField, cabinetPrimaryAction, cabinetSurface } from "@/src/modules/cabinet-experience/components";

export function ProfileForm({ context, locale }: { context: AgentCabinetContext; locale: AgentCabinetLocale }) {
  const [state, action, pending] = useActionState<ProfileActionState, FormData>(updateAgentProfileAction, { success: false, message: "" });
  const ro = locale === "ro";
  const message = state.message ? (state.success
    ? (ro ? "Profilul a fost salvat." : "Профиль сохранён.")
    : (ro ? "Profilul nu a putut fi salvat. Verificați datele." : "Не удалось сохранить профиль. Проверьте данные.")) : "";
  return <form action={action} className={`grid gap-4 p-4 sm:grid-cols-2 sm:p-5 ${cabinetSurface}`}>
    <Field defaultValue={context.phone ?? ""} label={ro ? "Telefon" : "Телефон"} name="phone"/><Field defaultValue={context.email ?? ""} label="Email" name="email" type="email"/>
    <Field defaultValue={context.locality ?? ""} label={ro ? "Localitate" : "Населённый пункт"} name="locality"/><Field defaultValue={context.profession ?? ""} label={ro ? "Profesie" : "Профессия"} name="profession"/>
    <div className="sm:col-span-2"><Field defaultValue={context.workplace ?? ""} label={ro ? "Loc de muncă" : "Место работы"} name="workplace"/></div>
    {message ? <div className="sm:col-span-2"><CabinetFeedback tone={state.success ? "saved" : "error"}>{message}</CabinetFeedback></div> : null}
    <button className={`${cabinetPrimaryAction} sm:col-span-2 sm:justify-self-start`} disabled={pending} type="submit"><Save aria-hidden size={18}/>{pending ? (ro ? "Se salvează…" : "Сохранение…") : (ro ? "Salvează" : "Сохранить")}</button>
  </form>;
}

function Field({ label, name, defaultValue, type = "text" }: { label: string; name: string; defaultValue: string; type?: string }) { return <label className="block text-sm font-medium text-zinc-800">{label}<input className={`${cabinetField} mt-1.5`} defaultValue={defaultValue} name={name} type={type}/></label>; }

"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  saveInstallationMarketplaceActivationAction,
  type PartnerActivationSaveActionState,
} from "./actions";
import {
  INSTALLATION_PARTNER_CAPABILITIES,
  type InstallationPartnerActivation,
  type InstallationPartnerCapability,
} from "./types";

const formCopy = {
  ru: {
    details:"Профиль исполнителя", descriptionRu:"Описание на русском", descriptionRo:"Описание на румынском",
    availability:"Доступность", capacity:"Одновременных работ", capabilities:"Компетенции", regions:"Регионы обслуживания",
    save:"Сохранить изменения", saving:"Сохранение…", saved:"Сохранено",
    termsAccept:"Принимаю условия участия в сети монтажников",
    privacyAccept:"Подтверждаю правила конфиденциальности и использование данных клиента только для выполнения принятой заявки",
    selfDeclared:"Заявлено партнёром", verified:"Проверено Novotech",
    available:"Доступен", limited:"Ограниченная загрузка", unavailable:"Недоступен",
  },
  ro: {
    details:"Profilul instalatorului", descriptionRu:"Descriere în rusă", descriptionRo:"Descriere în română",
    availability:"Disponibilitate", capacity:"Lucrări simultane", capabilities:"Competențe", regions:"Zone de deservire",
    save:"Salvează modificările", saving:"Se salvează…", saved:"Salvat",
    termsAccept:"Accept condițiile de participare în rețeaua de instalatori",
    privacyAccept:"Confirm regulile de confidențialitate și folosirea datelor clientului numai pentru executarea solicitării acceptate",
    selfDeclared:"Declarat de partener", verified:"Verificat de Novotech",
    available:"Disponibil", limited:"Disponibilitate limitată", unavailable:"Indisponibil",
  },
} as const;

const capabilityLabels: Record<"ru" | "ro", Record<InstallationPartnerCapability, string>> = {
  ru: { cctv:"Видеонаблюдение", intercom:"Домофония", access_control:"Контроль доступа", alarm:"Сигнализация", network:"Сети / Wi-Fi", other:"Другие монтажные системы" },
  ro: { cctv:"Supraveghere video", intercom:"Interfonie", access_control:"Control acces", alarm:"Alarmă", network:"Rețele / Wi-Fi", other:"Alte sisteme de instalare" },
};

export function PartnerActivationForm({ locale, activation }: { locale: "ru" | "ro"; activation: InstallationPartnerActivation }) {
  const router=useRouter();
  const t=formCopy[locale];
  const initialState:PartnerActivationSaveActionState={status:"idle",message:"",revision:activation.revision};
  const [result,action,pending]=useActionState(saveInstallationMarketplaceActivationAction,initialState);

  useEffect(()=>{
    if(result.status==="success") router.refresh();
  },[result.status,result.revision,router]);

  const succeeded=result.status==="success";
  return <form action={action} className="space-y-5 border border-zinc-200 bg-white p-5">
    <input name="revision" type="hidden" value={result.revision}/>
    <input name="locale" type="hidden" value={locale}/>
    <h2 className="text-lg font-semibold">{t.details}</h2>
    <div className="grid gap-4 md:grid-cols-2"><label className="grid gap-1 text-sm"><span className="font-medium">{t.descriptionRu}</span><textarea className="min-h-28 border border-zinc-300 p-3" defaultValue={activation.descriptionRu ?? ""} maxLength={1000} name="descriptionRu"/></label><label className="grid gap-1 text-sm"><span className="font-medium">{t.descriptionRo}</span><textarea className="min-h-28 border border-zinc-300 p-3" defaultValue={activation.descriptionRo ?? ""} maxLength={1000} name="descriptionRo"/></label></div>
    <div className="grid gap-4 md:grid-cols-2"><label className="grid gap-1 text-sm"><span className="font-medium">{t.availability}</span><select className="min-h-11 border border-zinc-300 px-3" defaultValue={activation.availability} name="availability"><option value="available">{t.available}</option><option value="limited">{t.limited}</option><option value="unavailable">{t.unavailable}</option></select></label><label className="grid gap-1 text-sm"><span className="font-medium">{t.capacity}</span><input className="min-h-11 border border-zinc-300 px-3" defaultValue={activation.maxConcurrentJobs ?? ""} max={100} min={1} name="maxConcurrentJobs" type="number"/></label></div>
    <fieldset><legend className="font-semibold">{t.capabilities}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{INSTALLATION_PARTNER_CAPABILITIES.map((code)=>{const selected=activation.capabilities.find((value)=>value.code===code);return <label className="flex min-h-11 items-center gap-3 border border-zinc-200 px-3 text-sm" key={code}><input defaultChecked={Boolean(selected)} name="capabilities" type="checkbox" value={code}/><span className="flex-1">{capabilityLabels[locale][code]}</span>{selected && <small className={selected.verificationStatus === "verified" ? "text-emerald-700" : "text-zinc-500"}>{selected.verificationStatus === "verified" ? t.verified : t.selfDeclared}</small>}</label>;})}</div></fieldset>
    <fieldset><legend className="font-semibold">{t.regions}</legend><div className="mt-2 grid max-h-72 gap-2 overflow-y-auto border border-zinc-200 p-2 sm:grid-cols-2 lg:grid-cols-3">{activation.regions.map((region)=><label className="flex min-h-11 items-center gap-3 px-2 text-sm" key={region.code}><input defaultChecked={activation.serviceAreaCodes.includes(region.code)} name="regions" type="checkbox" value={region.code}/><span>{region.name}</span></label>)}</div></fieldset>
    <div className="grid gap-2"><label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1" defaultChecked={activation.termsAccepted} name="acceptTerms" type="checkbox"/><span>{t.termsAccept}<small className="block text-zinc-500">{activation.termsVersion}</small></span></label><label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1" defaultChecked={activation.privacyAccepted} name="acceptPrivacy" type="checkbox"/><span>{t.privacyAccept}<small className="block text-zinc-500">{activation.privacyVersion}</small></span></label></div>
    {result.message ? <p aria-live="polite" className={`border-l-4 p-3 text-sm ${succeeded?"border-emerald-600 bg-emerald-50 text-emerald-900":"border-red-600 bg-red-50 text-red-900"}`} role={succeeded?"status":"alert"}>{result.message}</p> : null}
    <div className="flex justify-end"><button className={`min-h-11 rounded-md border px-5 text-sm font-semibold disabled:cursor-wait disabled:opacity-70 ${succeeded?"border-emerald-700 bg-emerald-700 text-white":"border-zinc-900"}`} disabled={pending} type="submit">{pending?t.saving:succeeded?t.saved:t.save}</button></div>
  </form>;
}

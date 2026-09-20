import { ArrowRight, BadgeCheck, BriefcaseBusiness, Building2, MapPin, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type {
  PublicPartnerCapabilityCode,
  PublicPartnerCapabilityDto,
  PublicPartnerDirectoryDto,
  PublicPartnerDirectoryEntryDto,
  PublicRetailLocale,
} from "../types";

export type PublicPartnerDirectoryFilters = {
  search: string;
  locality: string;
  capability: PublicPartnerCapabilityCode | null;
};

const CAPABILITY_COPY: Record<PublicRetailLocale, Record<PublicPartnerCapabilityCode, string>> = {
  ru: {
    CCTV: "Видеонаблюдение",
    ALARM: "Охранные системы",
    ACCESS_CONTROL: "Контроль доступа",
    INTERCOM: "Домофония",
    NETWORK: "Сети / Wi-Fi",
    OTHER: "Другие системы",
  },
  ro: {
    CCTV: "Supraveghere video",
    ALARM: "Sisteme de alarmă",
    ACCESS_CONTROL: "Control acces",
    INTERCOM: "Interfonie",
    NETWORK: "Rețele / Wi-Fi",
    OTHER: "Alte sisteme",
  },
};

export function PublicPartnerDirectory({
  locale,
  directory,
  filters,
}: {
  locale: PublicRetailLocale;
  directory: PublicPartnerDirectoryDto;
  filters: PublicPartnerDirectoryFilters;
}) {
  const ru = locale === "ru";
  const filtering = Boolean(filters.search || filters.locality || filters.capability);

  return <section className="mx-auto min-h-[calc(100vh-8rem)] max-w-[1440px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
    <header className="max-w-3xl">
      <p className="text-sm font-semibold text-blue-700">NOVOTECH SYSTEMS</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{ru ? "Сообщество партнёров" : "Comunitatea partenerilor"}</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-600">{ru
        ? "Публичные профили компаний, которые работают с профессиональными системами безопасности и решениями Novotech."
        : "Profiluri publice ale companiilor care lucrează cu sisteme profesionale de securitate și soluții Novotech."}</p>
    </header>

    <form aria-label={ru ? "Поиск и фильтры партнёров" : "Căutare și filtre parteneri"} className="mt-6 grid gap-3 border-y border-zinc-200 py-4 md:grid-cols-[minmax(14rem,1fr)_minmax(11rem,0.55fr)_minmax(12rem,0.65fr)_auto]" role="search">
      <label className="grid gap-1 text-xs font-semibold text-zinc-600">
        {ru ? "Поиск" : "Căutare"}
        <span className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input className="min-h-11 w-full border border-zinc-300 bg-white pl-10 pr-3 text-sm" defaultValue={filters.search} maxLength={100} name="q" placeholder={ru ? "Название или город" : "Denumire sau localitate"} />
        </span>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-zinc-600">
        {ru ? "Город / регион" : "Localitate / regiune"}
        <select className="min-h-11 min-w-0 border border-zinc-300 bg-white px-3 text-sm" defaultValue={filters.locality} name="locality">
          <option value="">{ru ? "Все" : "Toate"}</option>
          {directory.localities.map((locality) => <option key={locality} value={locality}>{locality}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-zinc-600">
        {ru ? "Специализация" : "Specializare"}
        <select className="min-h-11 min-w-0 border border-zinc-300 bg-white px-3 text-sm" defaultValue={filters.capability ?? ""} name="capability">
          <option value="">{ru ? "Все" : "Toate"}</option>
          {directory.capabilityCodes.map((code) => <option key={code} value={code}>{capabilityLabel(locale, code)}</option>)}
        </select>
      </label>
      <div className="flex items-end gap-2">
        <input name="lang" type="hidden" value={locale} />
        <button className="min-h-11 bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-blue-800">{ru ? "Найти" : "Caută"}</button>
        {filtering ? <Link className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-blue-800" href={`/partners?lang=${locale}`}>{ru ? "Сбросить" : "Resetează"}</Link> : null}
      </div>
    </form>

    <div className="mt-5 flex items-center justify-between gap-4 text-sm text-zinc-600">
      <p>{ru ? `Профилей: ${directory.items.length}` : `Profiluri: ${directory.items.length}`}</p>
      <p className="hidden sm:block">{ru ? "Нейтральный порядок по названию" : "Ordine neutră după denumire"}</p>
    </div>

    {directory.items.length ? <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {directory.items.map((partner) => <li key={partner.slug ?? partner.displayName}><PublicPartnerCard locale={locale} partner={partner} /></li>)}
    </ul> : <div className="mt-6 flex min-h-48 max-w-2xl items-center gap-4 border border-zinc-200 bg-zinc-50 p-6">
      <Building2 aria-hidden="true" className="size-9 shrink-0 text-zinc-300" />
      <div><h2 className="font-semibold">{filtering ? (ru ? "Партнёры не найдены" : "Nu au fost găsiți parteneri") : (ru ? "Профили готовятся к публикации" : "Profilurile sunt în curs de publicare")}</h2><p className="mt-1 text-sm leading-6 text-zinc-600">{filtering ? (ru ? "Измените условия поиска или сбросьте фильтры." : "Modificați căutarea sau resetați filtrele.") : (ru ? "Здесь появятся только явно опубликованные профили." : "Aici vor apărea doar profilurile publicate explicit.")}</p></div>
    </div>}

    <section className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-zinc-200 pt-6 sm:flex-row sm:items-center">
      <div><h2 className="font-semibold">{ru ? "Хотите стать партнёром Novotech?" : "Doriți să deveniți partener Novotech?"}</h2><p className="mt-1 text-sm text-zinc-600">{ru ? "Условия сотрудничества и форма заявки находятся отдельно от каталога." : "Condițiile de colaborare și formularul sunt separate de catalog."}</p></div>
      <Link className="inline-flex min-h-11 items-center gap-2 border border-zinc-300 px-4 text-sm font-semibold hover:border-blue-700 hover:text-blue-800" href={`/become-partner?lang=${locale}`}>{ru ? "Стать партнёром" : "Devino partener"}<ArrowRight aria-hidden="true" className="size-4" /></Link>
    </section>
  </section>;
}

export function PublicPartnerCard({ locale, partner }: { locale: PublicRetailLocale; partner: PublicPartnerDirectoryEntryDto }) {
  const ru = locale === "ru";
  return <article className="group flex h-full min-h-56 flex-col overflow-hidden border border-zinc-200 bg-white">
    <div className="relative grid h-20 place-items-center overflow-hidden bg-zinc-50 p-3">
      {partner.logoUrl ? <Image alt={ru ? `${partner.displayName} — логотип` : `Logo ${partner.displayName}`} className="object-contain p-2 grayscale transition-[filter] duration-200 group-hover:grayscale-0" fill sizes="(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) 50vw, 25vw" src={partner.logoUrl} /> : <Building2 aria-hidden="true" className="size-9 text-zinc-300" />}
    </div>
    <div className="flex flex-1 flex-col border-t border-zinc-100 px-4 py-3">
      <h2 className="text-sm font-semibold leading-5 text-zinc-950">{partner.displayName}</h2>
      {partner.locality ? <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-600"><MapPin aria-hidden="true" className="size-3.5 shrink-0" />{partner.locality}</p> : null}
      {partner.capabilities.length ? <ul aria-label={ru ? "Специализации" : "Specializări"} className="mt-3 flex flex-wrap gap-1.5">
        {partner.capabilities.slice(0, 4).map((capability) => <CapabilityBadge capability={capability} key={capability.code} locale={locale} />)}
      </ul> : <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500"><BriefcaseBusiness aria-hidden="true" className="size-3.5" />{ru ? "Профиль дополняется" : "Profilul se completează"}</p>}
      {partner.slug ? <Link className="mt-auto inline-flex min-h-11 items-center gap-2 pt-3 text-sm font-semibold text-blue-800 hover:text-blue-950" href={`/partners/${partner.slug}?lang=${locale}`}>{ru ? "Открыть профиль" : "Deschide profilul"}<ArrowRight aria-hidden="true" className="size-4" /></Link> : null}
    </div>
  </article>;
}

export function CapabilityBadge({ capability, locale }: { capability: PublicPartnerCapabilityDto; locale: PublicRetailLocale }) {
  const verified = capability.evidenceStatus === "VERIFIED";
  const verifiedText = locale === "ru" ? "Компетенция подтверждена Novotech" : "Competență confirmată de Novotech";
  return <li className={`inline-flex min-h-7 items-center gap-1 border px-2 text-[11px] font-medium ${verified ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-zinc-200 bg-zinc-50 text-zinc-700"}`} title={verified ? verifiedText : undefined}>
    {verified ? <BadgeCheck aria-label={verifiedText} className="size-3.5 shrink-0" /> : null}
    {capabilityLabel(locale, capability.code)}
  </li>;
}

export function capabilityLabel(locale: PublicRetailLocale, code: PublicPartnerCapabilityCode) {
  return CAPABILITY_COPY[locale][code];
}

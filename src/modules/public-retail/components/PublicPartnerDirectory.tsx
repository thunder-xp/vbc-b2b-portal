import { BadgeCheck, Building2 } from "lucide-react";
import Image from "next/image";

import type { PublicPartnerDirectoryEntryDto, PublicRetailLocale } from "../types";

export function PublicPartnerDirectory({ locale, partners }: { locale: PublicRetailLocale; partners: PublicPartnerDirectoryEntryDto[] }) {
  const ru = locale === "ru";

  return <section className="mx-auto min-h-[calc(100vh-8rem)] max-w-[1440px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
    <header className="max-w-2xl">
      <p className="text-sm font-semibold text-blue-700">NOVOTECH SYSTEMS</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{ru ? "Сообщество партнёров" : "Comunitatea partenerilor"}</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-600">{ru ? "Novotech работает с сетью профессиональных партнёров. Здесь опубликованы только подтверждённые публичные профили." : "Novotech colaborează cu o rețea de parteneri profesioniști. Aici sunt publicate doar profilurile publice confirmate."}</p>
    </header>
    {partners.length ? <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {partners.map((partner) => <li key={partner.displayName}><PublicPartnerCard locale={locale} partner={partner} /></li>)}
    </ul> : <div className="mt-8 flex min-h-48 max-w-xl items-center gap-4 rounded-md border border-zinc-200 bg-zinc-50 p-6">
      <Building2 aria-hidden="true" className="size-9 shrink-0 text-zinc-300" />
      <p className="text-sm leading-6 text-zinc-600">{ru ? "Список партнёров готовится к публикации." : "Lista partenerilor este în curs de pregătire pentru publicare."}</p>
    </div>}
  </section>;
}

export function PublicPartnerCard({ locale, partner }: { locale: PublicRetailLocale; partner: PublicPartnerDirectoryEntryDto }) {
  const ru = locale === "ru";
  return <article className="group grid min-h-44 grid-rows-[88px_auto] overflow-hidden rounded-md border border-zinc-200 bg-white">
    <div className="relative grid place-items-center overflow-hidden bg-zinc-50 p-3">
      {partner.logoUrl ? <Image alt={ru ? `${partner.displayName} — логотип` : `Logo ${partner.displayName}`} className="object-contain p-3 grayscale transition-[filter] duration-200 group-hover:grayscale-0" fill sizes="(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) 50vw, 25vw" src={partner.logoUrl} /> : <Building2 aria-hidden="true" className="size-9 text-zinc-300" />}
    </div>
    <div className="border-t border-zinc-100 px-4 py-3"><h2 className="text-sm font-semibold leading-5 text-zinc-900">{partner.displayName}</h2><p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-600"><BadgeCheck aria-hidden="true" className="size-3.5 shrink-0 text-emerald-700" />{ru ? "Публичный профиль подтверждён Novotech" : "Profil public confirmat de Novotech"}</p></div>
  </article>;
}

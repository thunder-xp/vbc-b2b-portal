import { Building2 } from "lucide-react";
import Image from "next/image";

import type { PublicPartnerDirectoryEntryDto, PublicRetailLocale } from "../types";

export function PublicPartnerDirectory({ locale, partners }: { locale: PublicRetailLocale; partners: PublicPartnerDirectoryEntryDto[] }) {
  const ru = locale === "ru";

  return <section className="mx-auto min-h-[calc(100vh-8rem)] max-w-[1440px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
    <header className="max-w-2xl">
      <p className="text-sm font-semibold text-emerald-700">NOVOTECH SYSTEMS</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{ru ? "Наши партнёры" : "Partenerii noștri"}</h1>
      <p className="mt-4 text-base leading-7 text-zinc-600">{ru ? "Компании, официально представленные в партнёрской сети Novotech." : "Companii prezentate oficial în rețeaua de parteneri Novotech."}</p>
    </header>
    {partners.length ? <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {partners.map((partner) => <li key={partner.displayName}><PublicPartnerCard partner={partner} /></li>)}
    </ul> : <div className="mt-8 flex min-h-48 max-w-xl items-center gap-4 rounded-md border border-zinc-200 bg-zinc-50 p-6">
      <Building2 aria-hidden="true" className="size-9 shrink-0 text-zinc-300" />
      <p className="text-sm leading-6 text-zinc-600">{ru ? "Список партнёров готовится к публикации." : "Lista partenerilor este în curs de pregătire pentru publicare."}</p>
    </div>}
  </section>;
}

export function PublicPartnerCard({ partner }: { partner: PublicPartnerDirectoryEntryDto }) {
  return <article className="grid min-h-48 grid-rows-[112px_auto] overflow-hidden rounded-md border border-zinc-200 bg-white">
    <div className="relative grid place-items-center overflow-hidden bg-zinc-50 p-4">
      {partner.logoUrl ? <Image alt={partner.displayName} className="object-contain p-4" fill sizes="(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) 50vw, 25vw" src={partner.logoUrl} /> : <Building2 aria-hidden="true" className="size-10 text-zinc-300" />}
    </div>
    <h2 className="flex min-h-16 items-center justify-center border-t border-zinc-100 px-4 py-3 text-center text-sm font-semibold leading-5 text-zinc-900">{partner.displayName}</h2>
  </article>;
}

import type { Metadata } from "next";
import { Clock3, Mail, MapPin, Phone } from "lucide-react";

import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { PublicStructuredData } from "@/src/modules/public-retail/components/PublicStructuredData";
import { publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { publicCompanyContent } from "@/src/modules/public-retail/public-company-content";
import { buildPublicMetadata, publicBreadcrumbSchema, publicLocalizedUrl, publicOrganizationSchemas } from "@/src/modules/public-retail/seo";

type Params = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const locale = publicRetailLocale((await searchParams).lang);
  return buildPublicMetadata({
    locale,
    path: "/contacts",
    title: locale === "ro" ? "Contacte și magazine Novotech — Chișinău și Bălți" : "Контакты и магазины Novotech — Кишинёв и Бельцы",
    description: locale === "ro"
      ? "Adresele, telefoanele și programul magazinelor Novotech cu echipamente și soluții de securitate."
      : "Адреса, телефоны и график магазинов Novotech с оборудованием и решениями для безопасности.",
  });
}

export default async function ContactsPage({ searchParams }: { searchParams: Params }) {
  const locale = publicRetailLocale((await searchParams).lang);
  const ru = locale === "ru";
  const schema = [
    publicBreadcrumbSchema([
      { name: ru ? "Главная" : "Principală", url: publicLocalizedUrl("/", locale) },
      { name: ru ? "Контакты" : "Contacte", url: publicLocalizedUrl("/contacts", locale) },
    ]),
    ...publicOrganizationSchemas(locale),
  ];

  return <PublicRetailShell languagePath="/contacts" locale={locale}>
    <PublicStructuredData data={schema} />
    <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <header className="max-w-3xl border-b border-zinc-200 pb-7">
        <p className="text-xs font-semibold uppercase text-emerald-700">Novotech Systems</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{ru ? "Контакты и магазины" : "Contacte și magazine"}</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">{publicCompanyContent.descriptor[locale]}</p>
      </header>

      <section aria-labelledby="stores-heading" className="py-8">
        <h2 className="text-xl font-semibold" id="stores-heading">{ru ? "Магазины" : "Magazine"}</h2>
        <div className="mt-5 grid border-l border-t border-zinc-200 md:grid-cols-2">
          {publicCompanyContent.stores.map((store) => <article className="border-b border-r border-zinc-200 p-5 sm:p-6" key={store.mapsHref}>
            <h3 className="text-lg font-semibold">{store.city[locale]}</h3>
            <a className="mt-4 flex min-h-11 w-fit items-start gap-3 rounded-sm text-sm font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-950" href={store.mapsHref} rel="noopener noreferrer" target="_blank"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{store.address[locale]}</a>
            <a className="mt-3 flex min-h-11 w-fit items-center gap-3 text-sm font-semibold text-emerald-800 hover:text-emerald-950" href={store.phone.href}><Phone aria-hidden="true" className="size-4" />{store.phone.display}</a>
            <p className="mt-3 flex items-start gap-3 text-sm leading-6 text-zinc-600"><Clock3 aria-hidden="true" className="mt-1 size-4 shrink-0 text-emerald-700" /><span>{publicCompanyContent.hours.weekdays[locale]}<br />{publicCompanyContent.hours.saturday[locale]}</span></p>
          </article>)}
        </div>
      </section>

      <section aria-labelledby="customer-contact-heading" className="border-t border-zinc-200 py-8">
        <h2 className="text-xl font-semibold" id="customer-contact-heading">{ru ? "Горячая линия" : "Linia fierbinte"}</h2>
        <div className="mt-5 flex flex-col gap-3 text-sm sm:flex-row sm:gap-8">
          <a className="flex min-h-11 w-fit items-center gap-3 font-semibold text-emerald-800 hover:text-emerald-950" href={publicCompanyContent.customerPhone.href}><Phone aria-hidden="true" className="size-4" />{publicCompanyContent.customerPhone.display}</a>
          <a className="flex min-h-11 w-fit items-center gap-3 font-semibold text-emerald-800 hover:text-emerald-950" href={`mailto:${publicCompanyContent.email}`}><Mail aria-hidden="true" className="size-4" />{publicCompanyContent.email}</a>
        </div>
      </section>
    </main>
  </PublicRetailShell>;
}

import type { Metadata } from "next";
import { ArrowLeft, Building2, ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CapabilityBadge } from "@/src/modules/public-retail/components/PublicPartnerDirectory";
import { PublicBreadcrumbs } from "@/src/modules/public-retail/components/PublicBreadcrumbs";
import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { PublicStructuredData } from "@/src/modules/public-retail/components/PublicStructuredData";
import { publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { buildPublicMetadata, compactSeoDescription, publicBreadcrumbSchema, publicLocalizedUrl } from "@/src/modules/public-retail/seo";
import { getPublicPartnerProfile } from "@/src/modules/public-retail/server";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = publicRetailLocale(query.lang);
  const partner = await getPublicPartnerProfile(slug).catch(() => null);
  if (!partner) return {};
  const description = locale === "ro" ? partner.descriptionRo : partner.descriptionRu;
  const fallback = locale === "ro"
    ? `${partner.displayName} — profil public în comunitatea partenerilor Novotech.`
    : `${partner.displayName} — публичный профиль в сообществе партнёров Novotech.`;
  return buildPublicMetadata({
    locale,
    path: `/partners/${partner.slug}`,
    title: `${partner.displayName} | Novotech`,
    description: compactSeoDescription(description ?? "", fallback),
    images: partner.logoUrl ? [partner.logoUrl] : undefined,
  });
}

export default async function PublicPartnerProfilePage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = publicRetailLocale(query.lang);
  const partner = await getPublicPartnerProfile(slug);
  if (!partner || !partner.slug) notFound();
  const ru = locale === "ru";
  const description = ru ? partner.descriptionRu : partner.descriptionRo;
  const breadcrumbs = [
    { name: ru ? "Главная" : "Principală", url: publicLocalizedUrl("/", locale) },
    { name: ru ? "Сообщество партнёров" : "Comunitatea partenerilor", url: publicLocalizedUrl("/partners", locale) },
    { name: partner.displayName, url: publicLocalizedUrl(`/partners/${partner.slug}`, locale) },
  ];
  const organization = {
    "@type": "Organization",
    name: partner.displayName,
    url: publicLocalizedUrl(`/partners/${partner.slug}`, locale),
    ...(partner.logoUrl ? { logo: partner.logoUrl } : {}),
    ...(partner.locality ? { address: { "@type": "PostalAddress", addressLocality: partner.locality, addressCountry: "MD" } } : {}),
    ...(partner.publicEmail ? { email: partner.publicEmail } : {}),
    ...(partner.publicPhone ? { telephone: partner.publicPhone } : {}),
    ...(partner.publicWebsite ? { sameAs: [partner.publicWebsite] } : {}),
  };

  return <PublicRetailShell languagePath={`/partners/${partner.slug}`} locale={locale}>
    <PublicStructuredData data={[publicBreadcrumbSchema(breadcrumbs), organization]} />
    <main className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 lg:px-8">
      <PublicBreadcrumbs items={breadcrumbs} label={ru ? "Хлебные крошки" : "Navigare ierarhică"} />
      <header className="mt-6 grid gap-5 border-y border-zinc-200 py-6 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
        <div className="relative grid size-28 place-items-center overflow-hidden bg-zinc-50 sm:size-32">
          {partner.logoUrl ? <Image alt={ru ? `${partner.displayName} — логотип` : `Logo ${partner.displayName}`} className="object-contain p-4" fill priority sizes="128px" src={partner.logoUrl} /> : <Building2 aria-hidden="true" className="size-12 text-zinc-300" />}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-blue-700">{ru ? "Публичный профиль партнёра" : "Profil public al partenerului"}</p>
          <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight sm:text-4xl">{partner.displayName}</h1>
          {partner.locality ? <p className="mt-3 flex items-center gap-2 text-sm text-zinc-600"><MapPin aria-hidden="true" className="size-4" />{partner.locality}</p> : null}
        </div>
      </header>

      <div className="grid gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-9">
          {description ? <section aria-labelledby="partner-about"><h2 className="text-xl font-semibold" id="partner-about">{ru ? "О компании" : "Despre companie"}</h2><p className="mt-3 whitespace-pre-line text-sm leading-7 text-zinc-700">{description}</p></section> : null}
          <section aria-labelledby="partner-capabilities"><h2 className="text-xl font-semibold" id="partner-capabilities">{ru ? "Специализация" : "Specializare"}</h2>{partner.capabilities.length ? <ul className="mt-3 flex flex-wrap gap-2">{partner.capabilities.map((capability) => <CapabilityBadge capability={capability} key={capability.code} locale={locale} />)}</ul> : <p className="mt-3 text-sm text-zinc-500">{ru ? "Публичная специализация пока не указана." : "Specializarea publică nu este încă indicată."}</p>}</section>
        </div>

        {(partner.publicEmail || partner.publicPhone || partner.publicWebsite) ? <aside className="border-l-0 border-zinc-200 lg:border-l lg:pl-6" aria-labelledby="partner-contact">
          <h2 className="text-xl font-semibold" id="partner-contact">{ru ? "Контакты" : "Contacte"}</h2>
          <div className="mt-3 grid gap-2 text-sm">
            {partner.publicEmail ? <a className="inline-flex min-h-11 items-center gap-2 break-all text-blue-800 hover:text-blue-950" href={`mailto:${partner.publicEmail}`}><Mail aria-hidden="true" className="size-4 shrink-0" />{partner.publicEmail}</a> : null}
            {partner.publicPhone ? <a className="inline-flex min-h-11 items-center gap-2 text-blue-800 hover:text-blue-950" href={`tel:${partner.publicPhone}`}><Phone aria-hidden="true" className="size-4 shrink-0" />{partner.publicPhone}</a> : null}
            {partner.publicWebsite ? <a className="inline-flex min-h-11 items-center gap-2 break-all text-blue-800 hover:text-blue-950" href={partner.publicWebsite} rel="noopener noreferrer" target="_blank">{ru ? "Сайт компании" : "Site-ul companiei"}<ExternalLink aria-hidden="true" className="size-4 shrink-0" /></a> : null}
          </div>
        </aside> : null}
      </div>

      <Link className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-blue-800 hover:text-blue-950" href={`/partners?lang=${locale}`}><ArrowLeft aria-hidden="true" className="size-4" />{ru ? "Все партнёры" : "Toți partenerii"}</Link>
    </main>
  </PublicRetailShell>;
}

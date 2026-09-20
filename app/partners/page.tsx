import type { Metadata } from "next";

import { PublicPartnerDirectory } from "@/src/modules/public-retail/components/PublicPartnerDirectory";
import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { PublicStructuredData } from "@/src/modules/public-retail/components/PublicStructuredData";
import { publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { buildPublicMetadata, publicBreadcrumbSchema, publicLocalizedUrl } from "@/src/modules/public-retail/seo";
import { getPublicPartnerDirectory } from "@/src/modules/public-retail/server";
import {
  PUBLIC_PARTNER_CAPABILITY_CODES,
  type PublicPartnerCapabilityCode,
} from "@/src/modules/public-retail/types";

type Params = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const query = await searchParams;
  const locale = publicRetailLocale(query.lang);
  const filtered = Object.keys(query).some((key) => key !== "lang");

  return buildPublicMetadata({
    locale,
    path: "/partners",
    title: locale === "ru" ? "Сообщество партнёров | Novotech" : "Comunitatea partenerilor | Novotech",
    description: locale === "ru"
      ? "Публичные профили компаний, работающих с профессиональными системами безопасности и решениями Novotech в Молдове."
      : "Profiluri publice ale companiilor care lucrează cu sisteme profesionale de securitate și soluții Novotech în Moldova.",
    index: !filtered,
  });
}

export default async function PublicPartnersPage({ searchParams }: { searchParams: Params }) {
  const query = await searchParams;
  const locale = publicRetailLocale(query.lang);
  const filters = {
    search: single(query.q).trim().slice(0, 100),
    locality: single(query.locality).trim().slice(0, 120),
    capability: capability(single(query.capability)),
  };
  const directory = await getPublicPartnerDirectory(filters);
  const schema = [
    publicBreadcrumbSchema([
      { name: locale === "ro" ? "Principală" : "Главная", url: publicLocalizedUrl("/", locale) },
      { name: locale === "ro" ? "Comunitatea partenerilor" : "Сообщество партнёров", url: publicLocalizedUrl("/partners", locale) },
    ]),
    {
      "@type": "ItemList",
      name: locale === "ro" ? "Comunitatea partenerilor Novotech" : "Сообщество партнёров Novotech",
      itemListElement: directory.items.map((partner, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "Organization",
          name: partner.displayName,
          ...(partner.logoUrl ? { logo: partner.logoUrl } : {}),
          ...(partner.slug ? { url: publicLocalizedUrl(`/partners/${partner.slug}`, locale) } : {}),
        },
      })),
    },
  ];

  return <PublicRetailShell languagePath="/partners" locale={locale}>
    <PublicStructuredData data={schema} />
    <main><PublicPartnerDirectory directory={directory} filters={filters} locale={locale} /></main>
  </PublicRetailShell>;
}

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function capability(value: string): PublicPartnerCapabilityCode | null {
  return PUBLIC_PARTNER_CAPABILITY_CODES.includes(value as PublicPartnerCapabilityCode)
    ? value as PublicPartnerCapabilityCode
    : null;
}

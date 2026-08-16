import type { Metadata } from "next";

import { PublicPartnerDirectory } from "@/src/modules/public-retail/components/PublicPartnerDirectory";
import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { PublicStructuredData } from "@/src/modules/public-retail/components/PublicStructuredData";
import { publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { buildPublicMetadata, publicBreadcrumbSchema, publicLocalizedUrl } from "@/src/modules/public-retail/seo";
import { getPublicPartnerDirectoryService } from "@/src/modules/public-retail/server";

type Params = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const locale = publicRetailLocale((await searchParams).lang);

  return buildPublicMetadata({
    locale,
    path: "/partners",
    title: locale === "ru" ? "Наши партнёры | Novotech" : "Partenerii noștri | Novotech",
    description: locale === "ru"
      ? "Официальная деловая партнёрская сеть Novotech Systems в Молдове."
      : "Rețeaua oficială de parteneri de afaceri Novotech Systems din Moldova.",
  });
}

export default async function PublicPartnersPage({ searchParams }: { searchParams: Params }) {
  const locale = publicRetailLocale((await searchParams).lang);
  const partners = await getPublicPartnerDirectoryService().listPartners();
  const schema = [
    publicBreadcrumbSchema([
      { name: locale === "ro" ? "Principală" : "Главная", url: publicLocalizedUrl("/", locale) },
      { name: locale === "ro" ? "Parteneri" : "Партнёры", url: publicLocalizedUrl("/partners", locale) },
    ]),
    {
      "@type": "ItemList",
      name: locale === "ro" ? "Partenerii Novotech" : "Партнёры Novotech",
      itemListElement: partners.map((partner, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: { "@type": "Organization", name: partner.displayName, ...(partner.logoUrl ? { logo: partner.logoUrl } : {}) },
      })),
    },
  ];

  return <PublicRetailShell languagePath="/partners" locale={locale}>
    <PublicStructuredData data={schema} />
    <main><PublicPartnerDirectory locale={locale} partners={partners} /></main>
  </PublicRetailShell>;
}

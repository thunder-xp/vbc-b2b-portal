import type { Metadata } from "next";

import { PublicPartnerDirectory } from "@/src/modules/public-retail/components/PublicPartnerDirectory";
import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { getPublicPartnerDirectoryService } from "@/src/modules/public-retail/server";

type Params = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const locale = publicRetailLocale((await searchParams).lang);

  return {
    title: locale === "ru" ? "Наши партнёры | Novotech" : "Partenerii noștri | Novotech",
    description: locale === "ru"
      ? "Официальная партнёрская сеть Novotech Systems."
      : "Rețeaua oficială de parteneri Novotech Systems.",
    alternates: { canonical: "/partners" },
  };
}

export default async function PublicPartnersPage({ searchParams }: { searchParams: Params }) {
  const locale = publicRetailLocale((await searchParams).lang);
  const partners = await getPublicPartnerDirectoryService().listPartners();

  return <PublicRetailShell languagePath="/partners" locale={locale}>
    <main><PublicPartnerDirectory locale={locale} partners={partners} /></main>
  </PublicRetailShell>;
}

import type { Metadata } from "next";

import { PublicCctvCalculator } from "@/src/modules/public-retail/components/PublicCctvCalculator";
import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { PublicStructuredData } from "@/src/modules/public-retail/components/PublicStructuredData";
import { publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { buildPublicMetadata, hasCalculatorState, publicBreadcrumbSchema, publicLocalizedUrl } from "@/src/modules/public-retail/seo";
import { publicCctvInitialInputFromSearchParams } from "@/src/modules/public-retail/services/public-cctv-calculator.service";
import { getPublicCctvServiceOptions } from "@/src/modules/public-retail/server";

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const params = await searchParams;
  const locale = publicRetailLocale(params.lang);
  return buildPublicMetadata({
    locale,
    path: "/calculator/cctv",
    title: locale === "ro" ? "Calcul sistem de supraveghere video | Novotech" : "Расчёт системы видеонаблюдения | Novotech",
    description: locale === "ro"
      ? "Calculator CCTV pentru selectarea echipamentelor și instalarea unui sistem de supraveghere video în Moldova."
      : "Калькулятор CCTV для подбора оборудования и монтажа системы видеонаблюдения в Молдове.",
    index: !hasCalculatorState(params),
    follow: true,
  });
}

export default async function PublicCctvCalculatorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const locale = publicRetailLocale(query.lang);
  const initialObject = Array.isArray(query.object) ? query.object[0] : query.object;
  const initialInput = publicCctvInitialInputFromSearchParams(query);
  const serviceOptions = await getPublicCctvServiceOptions().catch(() => []);
  const schema = [
    publicBreadcrumbSchema([
      { name: locale === "ro" ? "Principală" : "Главная", url: publicLocalizedUrl("/", locale) },
      { name: locale === "ro" ? "Calcul CCTV" : "Расчёт CCTV", url: publicLocalizedUrl("/calculator/cctv", locale) },
    ]),
    {
      "@type": "WebPage",
      name: locale === "ro" ? "Calcul sistem de supraveghere video" : "Расчёт системы видеонаблюдения",
      url: publicLocalizedUrl("/calculator/cctv", locale),
      inLanguage: locale,
      isPartOf: { "@id": `${publicLocalizedUrl("/", "ru")}#website` },
    },
  ];
  return <PublicRetailShell languagePath="/calculator/cctv" locale={locale}>
    <PublicStructuredData data={schema} />
    <main className="min-h-[calc(100vh-4rem)] bg-zinc-50" lang={locale}><PublicCctvCalculator initialInput={initialInput} initialObject={initialObject} locale={locale} serviceOptions={serviceOptions} /></main>
  </PublicRetailShell>;
}

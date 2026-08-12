import type { Metadata } from "next";

import { PublicCctvCalculator } from "@/src/modules/public-retail/components/PublicCctvCalculator";
import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { publicCctvInitialInputFromSearchParams } from "@/src/modules/public-retail/services/public-cctv-calculator.service";

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const locale = publicRetailLocale((await searchParams).lang);
  return {
    title: locale === "ro" ? "Calcul sistem de supraveghere video | Novotech" : "Расчёт системы видеонаблюдения | Novotech",
    description: locale === "ro"
      ? "Selecţie preliminară de camere, videorecorder, arhivă şi echipamente CCTV."
      : "Предварительный подбор камер, видеорегистратора, архива и оборудования CCTV.",
    alternates: { canonical: "/calculator/cctv" },
  };
}

export default async function PublicCctvCalculatorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const locale = publicRetailLocale(query.lang);
  const initialObject = Array.isArray(query.object) ? query.object[0] : query.object;
  const initialInput = publicCctvInitialInputFromSearchParams(query);
  return <PublicRetailShell languagePath="/calculator/cctv" locale={locale}>
    <main className="min-h-[calc(100vh-4rem)] bg-zinc-50" lang={locale}><PublicCctvCalculator initialInput={initialInput} initialObject={initialObject} locale={locale} /></main>
  </PublicRetailShell>;
}

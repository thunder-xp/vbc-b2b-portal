import type { Metadata } from "next";

import { PublicCctvCalculator } from "@/src/modules/public-retail/components/PublicCctvCalculator";
import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { publicCctvInputFromSearchParams } from "@/src/modules/public-retail/services/public-cctv-calculator.service";

export const metadata: Metadata = {
  title: "Расчёт системы видеонаблюдения | Novotech",
  description: "Предварительный подбор камер, видеорегистратора, архива и оборудования CCTV.",
  alternates: { canonical: "/calculator/cctv" },
};

export default async function PublicCctvCalculatorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const locale = publicRetailLocale(query.lang);
  const initialObject = Array.isArray(query.object) ? query.object[0] : query.object;
  let initialInput;
  try {
    initialInput = publicCctvInputFromSearchParams(query);
  } catch {
    initialInput = undefined;
  }
  return <PublicRetailShell languagePath="/calculator/cctv" locale={locale}>
    <main className="min-h-[calc(100vh-4rem)] bg-zinc-50"><PublicCctvCalculator initialInput={initialInput} initialObject={initialObject} locale={locale} /></main>
  </PublicRetailShell>;
}

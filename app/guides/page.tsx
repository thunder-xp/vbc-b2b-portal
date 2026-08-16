import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { buildPublicMetadata } from "@/src/modules/public-retail/seo";

type Params = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const locale = publicRetailLocale((await searchParams).lang);
  return buildPublicMetadata({
    locale,
    path: "/guides",
    title: locale === "ro" ? "Ghiduri pentru sisteme de securitate | Novotech" : "Как выбрать систему безопасности | Novotech",
    description: locale === "ro" ? "Ghiduri practice pentru alegerea echipamentelor și sistemelor de securitate." : "Практические материалы по выбору оборудования и систем безопасности.",
  });
}

export default async function GuidesPage({ searchParams }: { searchParams: Params }) {
  const locale = publicRetailLocale((await searchParams).lang);
  const ru = locale === "ru";
  return <PublicRetailShell languagePath="/guides" locale={locale}><main className="mx-auto max-w-[1100px] px-4 py-12 sm:px-6 lg:px-8"><p className="public-brand-eyebrow text-xs font-semibold uppercase">{ru ? "Полезные материалы" : "Ghiduri practice"}</p><h1 className="mt-2 text-4xl font-semibold">{ru ? "Как выбрать систему безопасности" : "Cum alegeți un sistem de securitate"}</h1><p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600">{ru ? "Понятные рекомендации по оборудованию, совместимости и подготовке монтажа." : "Recomandări clare despre echipamente, compatibilitate și pregătirea instalării."}</p><section className="mt-10 border border-zinc-200 p-6"><p className="text-xs font-semibold uppercase text-blue-700">CCTV</p><h2 className="mt-3 text-2xl font-semibold">{ru ? "Как подобрать видеонаблюдение для дома или бизнеса" : "Cum alegeți supravegherea video pentru casă sau afacere"}</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">{ru ? "Разбираем камеры, архив, сеть, питание и монтаж в практическом порядке." : "Analizăm camerele, arhiva, rețeaua, alimentarea și instalarea într-o ordine practică."}</p><Link className="public-brand-link mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold" href={`/guides/cctv-selection?lang=${locale}`}>{ru ? "Читать руководство" : "Citește ghidul"}<ArrowRight aria-hidden="true" className="size-4" /></Link></section></main></PublicRetailShell>;
}

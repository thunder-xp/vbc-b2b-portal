import type { Metadata } from "next";
import { ArrowRight, Camera, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { publicRetailLocale } from "@/src/modules/public-retail/presentation";

export const metadata: Metadata = { title: "Подбор системы видеонаблюдения | Novotech", description: "Путь к подбору совместимой системы видеонаблюдения для вашего объекта.", alternates: { canonical: "/solutions/cctv" } };

export default async function PublicCctvEntry({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const locale = publicRetailLocale(query.lang);
  const ru = locale === "ru";
  return <PublicRetailShell languagePath="/solutions/cctv" locale={locale}><main className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20"><div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start"><div className="grid aspect-square max-w-sm place-items-center bg-emerald-50 text-emerald-700"><Camera aria-hidden="true" className="size-24" strokeWidth={1.2} /></div><div><p className="text-xs font-semibold uppercase text-emerald-700">CCTV</p><h1 className="mt-3 text-4xl font-semibold leading-tight">{ru ? "Подбор системы видеонаблюдения" : "Alegerea sistemului de supraveghere video"}</h1><p className="mt-5 text-base leading-7 text-zinc-600">{ru ? "Онлайн-расчёт станет следующим этапом публичного сервиса. Сейчас вы можете перейти к проверенному каталогу видеонаблюдения и подобрать оборудование по характеристикам." : "Calculul online va fi următoarea etapă a serviciului public. Acum puteți deschide catalogul verificat de supraveghere video și selecta echipamente după caracteristici."}</p><ul className="mt-7 space-y-3 text-sm text-zinc-700">{(ru ? ["Камеры и регистраторы", "Хранение и сетевое оборудование", "Монтажные материалы"] : ["Camere și recordere", "Stocare și echipamente de rețea", "Materiale de instalare"]).map((item) => <li className="flex items-center gap-3" key={item}><CheckCircle2 aria-hidden="true" className="size-5 text-emerald-700" />{item}</li>)}</ul><Link className="mt-8 inline-flex min-h-12 items-center gap-2 bg-emerald-700 px-6 text-sm font-semibold text-white hover:bg-emerald-800" href={`/catalog?lang=${locale}&category=catalog-item-772c9d50`}>{ru ? "Открыть видеонаблюдение" : "Deschide supravegherea video"}<ArrowRight aria-hidden="true" className="size-4" /></Link></div></div></main></PublicRetailShell>;
}

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, BriefcaseBusiness, Building2, Cable, Camera, Factory, House, KeyRound,
  Network, PlugZap, Shapes, ShieldCheck, Store, Utensils, Warehouse,
} from "lucide-react";

import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { featuredRetailCategories, protectedObjectOptions, publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { getPublicRetailService } from "@/src/modules/public-retail/server";

type Params = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = {
  title: "Системы безопасности, оборудование и монтаж | Novotech",
  description: "Подбор профессиональной системы безопасности, оборудование, доставка и организация монтажа в Молдове.",
  alternates: { canonical: "/" },
};

export default async function Home({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const locale = publicRetailLocale(params.lang);
  const categories = await getPublicRetailService().listRetailCategories(locale);
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
  const categoryIcons = [Camera, ShieldCheck, KeyRound, Building2, Network, PlugZap, Cable];
  const objectIcons = [Building2, House, BriefcaseBusiness, Store, Warehouse, Factory, Utensils, Shapes];
  const ru = locale === "ru";

  return <PublicRetailShell languagePath="/" locale={locale}>
    <main>
      <section className="relative isolate min-h-[560px] overflow-hidden sm:min-h-[600px] lg:min-h-[620px]">
        <Image alt="Профессиональная установка системы видеонаблюдения" className="object-cover object-[68%_center]" fill priority sizes="100vw" src="/retail/security-installation-hero.webp" />
        <div aria-hidden="true" className="absolute inset-0 bg-zinc-950/55" />
        <div className="relative mx-auto flex min-h-[560px] max-w-[1440px] items-center px-4 py-14 sm:min-h-[600px] sm:px-6 lg:min-h-[620px] lg:px-8">
          <div className="max-w-2xl text-white">
            <p className="text-sm font-semibold uppercase text-emerald-300">Novotech Security Systems</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">{ru ? "Системы безопасности под ключ" : "Sisteme de securitate complete"}</h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-zinc-100 sm:text-lg">{ru ? "Поможем рассчитать систему, выбрать совместимое оборудование, организовать доставку и профессиональный монтаж." : "Vă ajutăm să calculați sistemul, să alegeți echipamente compatibile și să organizați livrarea și instalarea profesională."}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link className="inline-flex min-h-12 items-center justify-center gap-2 rounded-sm bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-500" href={`/solutions/cctv?lang=${locale}`}>{ru ? "Подобрать систему" : "Alege un sistem"}<ArrowRight aria-hidden="true" className="size-4" /></Link>
              <Link className="inline-flex min-h-12 items-center justify-center rounded-sm border border-white/70 bg-white/10 px-6 text-sm font-semibold text-white hover:bg-white hover:text-zinc-950" href={`/catalog?lang=${locale}`}>{ru ? "Перейти в каталог" : "Deschide catalogul"}</Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-7 gap-y-3 text-sm text-zinc-100"><li>{ru ? "Гарантия на оборудование" : "Garanție pentru echipamente"}</li><li>{ru ? "Доставка по Молдове" : "Livrare în Moldova"}</li><li>{ru ? "Техническая консультация" : "Consultanță tehnică"}</li></ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-14 sm:px-6 lg:px-8 lg:py-18" id="solution">
        <div className="max-w-2xl"><p className="text-xs font-semibold uppercase text-emerald-700">{ru ? "Начните с задачи" : "Începeți cu obiectivul"}</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">{ru ? "Что вам нужно защитить?" : "Ce doriți să protejați?"}</h2><p className="mt-3 text-sm leading-6 text-zinc-600">{ru ? "Первый онлайн-подбор будет доступен для систем видеонаблюдения." : "Prima selecție online va fi disponibilă pentru sisteme de supraveghere video."}</p></div>
        <div className="mt-8 grid grid-cols-2 border-l border-t border-zinc-200 sm:grid-cols-4 lg:grid-cols-8">{protectedObjectOptions.map((item, index) => { const Icon = objectIcons[index]; return <Link className="group min-h-32 border-b border-r border-zinc-200 p-4 hover:bg-emerald-50" href={`/solutions/cctv?lang=${locale}&object=${item.key}`} key={item.key}><Icon aria-hidden="true" className="size-6 text-emerald-700" strokeWidth={1.7} /><span className="mt-5 block text-sm font-semibold leading-5">{ru ? item.ru : item.ro}</span><ArrowRight aria-hidden="true" className="mt-2 size-4 text-zinc-300 group-hover:text-emerald-700" /></Link>; })}</div>
      </section>

      <section className="border-y border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-6 lg:px-8 lg:py-18"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase text-emerald-700">{ru ? "Каталог" : "Catalog"}</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">{ru ? "Системы и оборудование" : "Sisteme și echipamente"}</h2></div><Link className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-700" href={`/catalog?lang=${locale}`}>{ru ? "Весь каталог" : "Tot catalogul"}<ArrowRight aria-hidden="true" className="size-4" /></Link></div>
          <div className="mt-8 grid gap-px bg-zinc-200 sm:grid-cols-2 lg:grid-cols-4">{featuredRetailCategories.map((item, index) => { const category = categoryBySlug.get(item.slug); if (!category) return null; const Icon = categoryIcons[index]; return <Link className="group min-h-44 bg-white p-5 hover:bg-emerald-50" href={`/catalog?lang=${locale}&category=${category.slug}`} key={item.slug}><Icon aria-hidden="true" className="size-7 text-emerald-700" strokeWidth={1.6} /><h3 className="mt-7 text-lg font-semibold">{ru ? item.ru : item.ro}</h3><p className="mt-2 text-sm text-zinc-500">{category.productCount} {ru ? "товаров" : "produse"}</p><ArrowRight aria-hidden="true" className="mt-5 size-4 text-zinc-300 group-hover:text-emerald-700" /></Link>; })}</div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1440px] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-18" id="installation"><div><p className="text-xs font-semibold uppercase text-emerald-700">{ru ? "Решение целиком" : "Soluția completă"}</p><h2 className="mt-2 text-3xl font-semibold">{ru ? "От оборудования до работающей системы" : "De la echipament la un sistem funcțional"}</h2><p className="mt-4 max-w-xl text-base leading-7 text-zinc-600">{ru ? "Novotech помогает подобрать совместимые компоненты и подготовить решение с учётом объекта. Возможность и условия монтажа уточняются при подготовке системы." : "Novotech vă ajută să alegeți componente compatibile și să pregătiți soluția pentru obiectiv. Posibilitatea și condițiile instalării se confirmă la pregătirea sistemului."}</p></div><ol className="grid gap-px bg-zinc-200 sm:grid-cols-3"><li className="bg-white p-5"><span className="text-xs font-semibold text-emerald-700">01</span><p className="mt-4 font-semibold">{ru ? "Расчёт" : "Calcul"}</p></li><li className="bg-white p-5"><span className="text-xs font-semibold text-emerald-700">02</span><p className="mt-4 font-semibold">{ru ? "Комплектация" : "Echipare"}</p></li><li className="bg-white p-5"><span className="text-xs font-semibold text-emerald-700">03</span><p className="mt-4 font-semibold">{ru ? "Монтаж" : "Instalare"}</p></li></ol></section>

      <section className="border-t border-zinc-200 bg-emerald-800 text-white" id="delivery"><div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8"><div><h2 className="text-2xl font-semibold">{ru ? "Уже знаете нужную модель?" : "Știți deja modelul necesar?"}</h2><p className="mt-2 text-sm text-emerald-100">{ru ? "Найдите товар по модели, артикулу или названию." : "Găsiți produsul după model, cod sau denumire."}</p></div><Link className="inline-flex min-h-12 items-center justify-center bg-white px-6 text-sm font-semibold text-emerald-900" href={`/catalog?lang=${locale}`}>{ru ? "Открыть каталог" : "Deschide catalogul"}</Link></div></section>
    </main>
  </PublicRetailShell>;
}

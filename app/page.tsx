import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, BriefcaseBusiness, Building2, Cable, Camera, CheckCircle2, Factory,
  House, KeyRound, Network, PlugZap, ShieldCheck, Store, Utensils, Warehouse,
} from "lucide-react";

import { PublicRetailSearchForm } from "@/src/modules/public-retail/components/PublicRetailSearchForm";
import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { PublicStructuredData } from "@/src/modules/public-retail/components/PublicStructuredData";
import { featuredRetailCategories, protectedObjectOptions, publicRetailFullCatalogHref, publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { publicCompanyContent } from "@/src/modules/public-retail/public-company-content";
import { buildPublicMetadata, publicOrganizationSchemas } from "@/src/modules/public-retail/seo";
import { getPublicRetailService } from "@/src/modules/public-retail/server";

type Params = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const locale = publicRetailLocale((await searchParams).lang);
  return buildPublicMetadata({
    locale,
    path: "/",
    title: locale === "ro" ? "Sisteme de securitate și instalare în Moldova | Novotech" : "Системы безопасности и монтаж в Молдове | Novotech",
    description: locale === "ro" ? "Echipamente profesionale, calcul CCTV, livrare și instalare a sistemelor de securitate în Moldova." : "Профессиональное оборудование, расчёт CCTV, доставка и монтаж систем безопасности в Молдове.",
  });
}

export default async function Home({ searchParams }: { searchParams: Params }) {
  const locale = publicRetailLocale((await searchParams).lang);
  const categories = await getPublicRetailService().listRetailCategories(locale);
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
  const categoryIcons = [Camera, ShieldCheck, KeyRound, Building2, Network, PlugZap, Cable];
  const objectIcons = [Building2, House, BriefcaseBusiness, Store, Warehouse, Factory, Utensils];
  const ru = locale === "ru";

  return <PublicRetailShell languagePath="/" locale={locale}>
    <PublicStructuredData data={publicOrganizationSchemas(locale, true)} />
    <main>
      <section className="relative isolate min-h-[520px] overflow-hidden sm:min-h-[570px] lg:min-h-[600px]">
        <Image alt={ru ? "Профессиональная установка системы видеонаблюдения" : "Instalarea profesională a unui sistem de supraveghere video"} className="object-cover object-[68%_center]" fill priority sizes="100vw" src="/retail/security-installation-hero.webp" />
        <div aria-hidden="true" className="absolute inset-0 bg-zinc-950/60" />
        <div className="relative mx-auto flex min-h-[520px] max-w-[1440px] items-center px-4 py-12 sm:min-h-[570px] sm:px-6 lg:min-h-[600px] lg:px-8">
          <div className="max-w-2xl text-white">
            <p className="text-sm font-semibold text-blue-200">{publicCompanyContent.descriptor[locale]}</p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">{ru ? "Системы безопасности для дома и бизнеса" : "Sisteme de securitate pentru casă și afaceri"}</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-zinc-100 sm:text-lg">{ru ? "Выберите оборудование самостоятельно или получите расчёт совместимой системы с доставкой и профессиональным монтажом." : "Alegeți echipamentul sau obțineți calculul unui sistem compatibil, cu livrare și instalare profesională."}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link className="public-primary-action inline-flex min-h-12 items-center justify-center gap-2 rounded-sm px-6 text-sm font-semibold" href={`/calculator/cctv?lang=${locale}`}>{ru ? "Подобрать систему" : "Alege un sistem"}<ArrowRight aria-hidden="true" className="size-4" /></Link>
              <Link className="inline-flex min-h-12 items-center justify-center rounded-sm border border-white/70 bg-white/10 px-6 text-sm font-semibold text-white hover:bg-white hover:text-zinc-950" href={publicRetailFullCatalogHref(locale)}>{ru ? "Купить оборудование" : "Cumpără echipamente"}</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6 lg:px-8">
          <h2 className="text-center text-xl font-semibold">{ru ? "Найдите нужную модель или категорию" : "Găsiți modelul sau categoria potrivită"}</h2>
          <div className="mx-auto mt-5 max-w-3xl"><PublicRetailSearchForm id="home" locale={locale} prominent /></div>
          <div className="mt-5 flex flex-wrap justify-center gap-2">{featuredRetailCategories.slice(0, 5).map((item) => { const category = categoryBySlug.get(item.slug); return category ? <Link className="inline-flex min-h-11 items-center border border-zinc-300 bg-white px-3 text-sm font-medium hover:border-blue-600 hover:text-blue-800" href={`/catalog?lang=${locale}&category=${category.slug}`} key={item.slug}>{ru ? item.ru : item.ro}</Link> : null; })}</div>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-14 sm:px-6 lg:px-8" id="solution">
        <div className="flex flex-wrap items-end justify-between gap-4"><div className="max-w-2xl"><p className="public-brand-eyebrow text-xs font-semibold uppercase">{ru ? "По типу объекта" : "După tipul obiectivului"}</p><h2 className="mt-2 text-3xl font-semibold">{ru ? "Решение под вашу задачу" : "Soluție pentru obiectivul dvs."}</h2><p className="mt-3 text-sm leading-6 text-zinc-600">{ru ? "Ответьте на несколько вопросов, чтобы получить ориентировочный состав системы видеонаблюдения." : "Răspundeți la câteva întrebări pentru a primi o configurație orientativă CCTV."}</p></div><Link className="public-brand-link inline-flex min-h-11 items-center gap-2 text-sm font-semibold" href={`/calculator/cctv?lang=${locale}`}>{ru ? "Начать подбор" : "Începe selecția"}<ArrowRight aria-hidden="true" className="size-4" /></Link></div>
        <div className="mt-8 grid border-l border-t border-zinc-200 sm:grid-cols-2 lg:grid-cols-4">{protectedObjectOptions.slice(0, 7).map((item, index) => { const Icon = objectIcons[index]; return <Link className="group min-h-32 border-b border-r border-zinc-200 p-5 hover:bg-blue-50" href={`/calculator/cctv?lang=${locale}&object=${item.key}`} key={item.key}><Icon aria-hidden="true" className="size-6 text-blue-700" strokeWidth={1.7} /><span className="mt-5 block text-sm font-semibold">{ru ? item.ru : item.ro}</span><ArrowRight aria-hidden="true" className="mt-2 size-4 text-zinc-300 group-hover:text-blue-700" /></Link>; })}</div>
      </section>

      <section className="border-y border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-6 lg:px-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="public-brand-eyebrow text-xs font-semibold uppercase">{ru ? "Каталог" : "Catalog"}</p><h2 className="mt-2 text-3xl font-semibold">{ru ? "Системы и оборудование" : "Sisteme și echipamente"}</h2></div><Link className="public-brand-link inline-flex min-h-11 items-center gap-2 text-sm font-semibold" href={publicRetailFullCatalogHref(locale)}>{ru ? "Весь каталог" : "Tot catalogul"}<ArrowRight aria-hidden="true" className="size-4" /></Link></div>
          <div className="mt-8 grid gap-px bg-zinc-200 sm:grid-cols-2 lg:grid-cols-4">{featuredRetailCategories.map((item, index) => { const category = categoryBySlug.get(item.slug); if (!category) return null; const Icon = categoryIcons[index]; return <Link className="group min-h-40 bg-white p-5 hover:bg-blue-50" href={`/catalog?lang=${locale}&category=${category.slug}`} key={item.slug}><Icon aria-hidden="true" className="size-7 text-blue-700" strokeWidth={1.6} /><h3 className="mt-6 text-lg font-semibold">{ru ? item.ru : item.ro}</h3><p className="mt-2 text-sm text-zinc-500">{category.productCount} {ru ? "товаров" : "produse"}</p></Link>; })}</div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1440px] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[.9fr_1.1fr] lg:px-8" id="installation">
        <div><p className="public-brand-eyebrow text-xs font-semibold uppercase">{ru ? "Проект и монтаж" : "Proiect și instalare"}</p><h2 className="mt-2 text-3xl font-semibold">{ru ? "От подбора до работающей системы" : "De la selecție la un sistem funcțional"}</h2><p className="mt-4 max-w-xl text-base leading-7 text-zinc-600">{ru ? "Поможем определить состав оборудования, проверить совместимость и подготовить монтаж с учётом объекта." : "Vă ajutăm să definiți echipamentele, să verificați compatibilitatea și să pregătiți instalarea pentru obiectiv."}</p><Link className="public-primary-action mt-6 inline-flex min-h-12 items-center gap-2 px-5 text-sm font-semibold" href={`/installation?lang=${locale}&system=cctv&from=/`}>{ru ? "Как проходит монтаж" : "Cum decurge instalarea"}<ArrowRight aria-hidden="true" className="size-4" /></Link></div>
        <ol className="grid gap-px bg-zinc-200 sm:grid-cols-2"><ProcessStep number="01" title={ru ? "Расчёт" : "Calcul"} text={ru ? "Задача и состав системы" : "Obiectivul și configurația"} /><ProcessStep number="02" title={ru ? "Проверка" : "Verificare"} text={ru ? "Совместимость и условия объекта" : "Compatibilitatea și condițiile"} /><ProcessStep number="03" title={ru ? "Комплектация" : "Echipare"} text={ru ? "Оборудование и материалы" : "Echipamente și materiale"} /><ProcessStep number="04" title={ru ? "Монтаж" : "Instalare"} text={ru ? "Установка и настройка" : "Montare și configurare"} /></ol>
      </section>

      <section className="border-y border-zinc-200 bg-zinc-950 text-white" id="about"><div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-12 sm:px-6 md:grid-cols-3 lg:px-8">{[
        [ru ? "Профессиональный подбор" : "Selecție profesională", ru ? "Совместимость компонентов проверяется при подготовке решения." : "Compatibilitatea componentelor este verificată la pregătirea soluției."],
        [ru ? "Доставка по Молдове" : "Livrare în Moldova", ru ? "Получение в магазинах Novotech или согласованная доставка." : "Ridicare din magazinele Novotech sau livrare coordonată."],
        [ru ? "Поддержка и гарантия" : "Suport și garanție", ru ? "Консультация по оборудованию до и после покупки." : "Consultanță privind echipamentele înainte și după cumpărare."],
      ].map(([title, text]) => <div key={title}><CheckCircle2 aria-hidden="true" className="size-6 text-blue-400" /><h2 className="mt-4 text-lg font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-zinc-300">{text}</p></div>)}</div></section>

      <section className="mx-auto max-w-[1440px] px-4 py-12 sm:px-6 lg:px-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="public-brand-eyebrow text-xs font-semibold uppercase">{ru ? "Полезно знать" : "Ghiduri"}</p><h2 className="mt-2 text-2xl font-semibold">{ru ? "Как выбрать систему" : "Cum alegeți sistemul"}</h2></div><Link className="public-brand-link inline-flex min-h-11 items-center gap-2 text-sm font-semibold" href={`/guides?lang=${locale}`}>{ru ? "Все материалы" : "Toate ghidurile"}<ArrowRight aria-hidden="true" className="size-4" /></Link></div><Link className="mt-6 block border border-zinc-200 p-5 hover:border-blue-500" href={`/guides/cctv-selection?lang=${locale}`}><h3 className="text-lg font-semibold">{ru ? "Как подобрать видеонаблюдение для дома или бизнеса" : "Cum alegeți supravegherea video pentru casă sau afacere"}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{ru ? "Камеры, архив, сеть и монтаж: практический порядок выбора без лишних технических сложностей." : "Camere, arhivă, rețea și instalare: o ordine practică de alegere."}</p></Link></section>

      <section className="bg-blue-800 text-white" id="delivery"><div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8"><div><h2 className="text-2xl font-semibold">{ru ? "Уже знаете нужную модель?" : "Știți deja modelul necesar?"}</h2><p className="mt-2 text-sm text-blue-100">{ru ? "Найдите товар по модели, артикулу или названию." : "Găsiți produsul după model, cod sau denumire."}</p></div><Link className="inline-flex min-h-12 items-center justify-center bg-white px-6 text-sm font-semibold text-blue-900" href={publicRetailFullCatalogHref(locale)}>{ru ? "Открыть каталог" : "Deschide catalogul"}</Link></div></section>
    </main>
  </PublicRetailShell>;
}

function ProcessStep({ number, title, text }: { number: string; title: string; text: string }) {
  return <li className="bg-white p-5"><span className="text-xs font-semibold text-blue-700">{number}</span><p className="mt-4 font-semibold">{title}</p><p className="mt-1 text-sm text-zinc-500">{text}</p></li>;
}

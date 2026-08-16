import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, BriefcaseBusiness, Building2, Cable, Camera, Factory, House, KeyRound,
  Network, PlugZap, Shapes, ShieldCheck, Store, Utensils, Warehouse,
} from "lucide-react";

import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { featuredRetailCategories, protectedObjectOptions, publicRetailFullCatalogHref, publicRetailLocale, publicRetailShowcaseHref } from "@/src/modules/public-retail/presentation";
import { publicCompanyContent } from "@/src/modules/public-retail/public-company-content";
import { buildPublicMetadata, publicOrganizationSchemas } from "@/src/modules/public-retail/seo";
import { PublicStructuredData } from "@/src/modules/public-retail/components/PublicStructuredData";
import { getPublicRetailService } from "@/src/modules/public-retail/server";

type Params = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const locale = publicRetailLocale((await searchParams).lang);
  return buildPublicMetadata({
    locale,
    path: "/",
    title: locale === "ro"
      ? "Sisteme de securitate, supraveghere video și instalare în Moldova | Novotech"
      : "Системы безопасности, видеонаблюдение и монтаж в Молдове | Novotech",
    description: locale === "ro"
      ? "Camere și echipamente profesionale de securitate, selecție CCTV, livrare și instalare în Moldova. Alegeți echipamentul sau calculați un sistem complet."
      : "Камеры и профессиональное оборудование для систем безопасности, подбор CCTV, доставка и монтаж по Молдове. Выберите товар или рассчитайте систему под ключ.",
  });
}

export default async function Home({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const locale = publicRetailLocale(params.lang);
  const categories = await getPublicRetailService().listRetailCategories(locale);
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
  const categoryIcons = [Camera, ShieldCheck, KeyRound, Building2, Network, PlugZap, Cable];
  const objectIcons = [Building2, House, BriefcaseBusiness, Store, Warehouse, Factory, Utensils, Shapes];
  const ru = locale === "ru";

  const schema = publicOrganizationSchemas(locale, true);

  return <PublicRetailShell languagePath="/" locale={locale}>
    <PublicStructuredData data={schema} />
    <main>
      <section className="relative isolate min-h-[560px] overflow-hidden sm:min-h-[600px] lg:min-h-[620px]">
        <Image alt={ru ? "Профессиональная установка системы видеонаблюдения" : "Instalarea profesională a unui sistem de supraveghere video"} className="object-cover object-[68%_center]" fill priority sizes="100vw" src="/retail/security-installation-hero.webp" />
        <div aria-hidden="true" className="absolute inset-0 bg-zinc-950/60" />
        <div className="relative mx-auto flex min-h-[560px] max-w-[1440px] items-center px-4 py-14 sm:min-h-[600px] sm:px-6 lg:min-h-[620px] lg:px-8">
          <div className="max-w-2xl text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">NOVOTECH SYSTEMS · DISTRIBUTION</p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">{ru ? "Системы безопасности и видеонаблюдение под ключ" : "Sisteme de securitate și supraveghere video la cheie"}</h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-zinc-100 sm:text-lg">{ru ? "Подберём совместимое оборудование, рассчитаем систему под ваш объект, организуем доставку и профессиональный монтаж по Молдове." : "Selectăm echipamente compatibile, calculăm sistemul pentru obiectivul dvs. și organizăm livrarea și instalarea profesională în Moldova."}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link className="inline-flex min-h-12 items-center justify-center gap-2 rounded-sm bg-[#3083EB] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#236FD0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" href={`/calculator/cctv?lang=${locale}`}>{ru ? "Рассчитать систему" : "Calculează sistemul"}<ArrowRight aria-hidden="true" className="size-4" /></Link>
              <Link className="inline-flex min-h-12 items-center justify-center rounded-sm border border-white/70 bg-white/10 px-6 text-sm font-semibold text-white transition-colors hover:bg-white hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" href={publicRetailShowcaseHref(locale)}>{ru ? "Перейти в каталог" : "Deschide catalogul"}</Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-7 gap-y-3 text-sm text-zinc-100"><li>{ru ? "Гарантия на оборудование" : "Garanție pentru echipamente"}</li><li>{ru ? "Доставка по Молдове" : "Livrare în Moldova"}</li><li>{ru ? "Техническая консультация" : "Consultanță tehnică"}</li></ul>
          </div>
        </div>
      </section>

      <section aria-label={ru ? "Преимущества Novotech" : "Avantajele Novotech"} className="border-b border-zinc-200 bg-white">
        <div className="mx-auto grid max-w-[1440px] divide-y divide-zinc-200 px-4 sm:grid-cols-2 sm:divide-x sm:divide-y-0 sm:px-6 lg:grid-cols-4 lg:px-8">
          {[ru ? "Прямой импорт оборудования" : "Import direct de echipamente", ru ? "Подбор совместимых компонентов" : "Selectarea componentelor compatibile", ru ? "Монтаж систем по Молдове" : "Instalarea sistemelor în Moldova", ru ? "Магазины в Кишинёве и Бельцах" : "Magazine în Chișinău și Bălți"].map((item) => <div className="flex min-h-20 items-center gap-3 px-4 py-4 first:pl-0 last:pr-0" key={item}><span aria-hidden="true" className="size-2 shrink-0 bg-[#625DDD]" /><span className="text-sm font-semibold text-zinc-800">{item}</span></div>)}
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-14 sm:px-6 lg:px-8 lg:py-18" id="solution">
        <div className="max-w-2xl"><p className="text-xs font-semibold uppercase text-[#236FD0]">{ru ? "Начните с задачи" : "Începeți cu obiectivul"}</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">{ru ? "Что вам нужно защитить?" : "Ce doriți să protejați?"}</h2><p className="mt-3 text-sm leading-6 text-zinc-600">{ru ? "Ответьте на несколько вопросов — система подберёт комплект видеонаблюдения под объект, требования к архиву и монтажу." : "Răspundeți la câteva întrebări — sistemul va selecta un set CCTV pentru obiectiv, arhivă și instalare."}</p></div>
        <div className="mt-8 grid grid-cols-2 border-l border-t border-zinc-200 sm:grid-cols-4 lg:grid-cols-8">{protectedObjectOptions.map((item, index) => { const Icon = objectIcons[index]; return <Link className="group min-h-32 border-b border-r border-zinc-200 p-4 transition-colors hover:bg-blue-50" href={`/calculator/cctv?lang=${locale}&object=${item.key}`} key={item.key}><Icon aria-hidden="true" className="size-6 text-[#3083EB]" strokeWidth={1.7} /><span className="mt-5 block text-sm font-semibold leading-5">{ru ? item.ru : item.ro}</span><ArrowRight aria-hidden="true" className="mt-2 size-4 text-zinc-300 group-hover:text-[#3083EB]" /></Link>; })}</div>
      </section>

      <section className="border-y border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-6 lg:px-8 lg:py-18"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase text-[#236FD0]">{ru ? "Каталог" : "Catalog"}</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">{ru ? "Системы и оборудование" : "Sisteme și echipamente"}</h2></div><Link className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#236FD0] hover:text-[#625DDD]" href={publicRetailFullCatalogHref(locale)}>{ru ? "Весь каталог" : "Tot catalogul"}<ArrowRight aria-hidden="true" className="size-4" /></Link></div>
          <div className="mt-8 grid gap-px bg-zinc-200 sm:grid-cols-2 lg:grid-cols-4">{featuredRetailCategories.map((item, index) => { const category = categoryBySlug.get(item.slug); if (!category) return null; const Icon = categoryIcons[index]; return <Link className="group min-h-44 bg-white p-5 transition-colors hover:bg-blue-50" href={`/catalog?lang=${locale}&category=${category.slug}`} key={item.slug}><Icon aria-hidden="true" className="size-7 text-[#3083EB]" strokeWidth={1.6} /><h3 className="mt-7 text-lg font-semibold">{ru ? item.ru : item.ro}</h3><p className="mt-2 text-sm text-zinc-500">{category.productCount} {ru ? "товаров" : "produse"}</p><ArrowRight aria-hidden="true" className="mt-5 size-4 text-zinc-300 group-hover:text-[#3083EB]" /></Link>; })}</div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1440px] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:px-8 lg:py-18" id="installation"><div><p className="text-xs font-semibold uppercase text-[#236FD0]">{ru ? "Монтаж" : "Instalare"}</p><h2 className="mt-2 text-3xl font-semibold">{ru ? "Не просто оборудование — готовая работающая система" : "Nu doar echipamente — un sistem complet funcțional"}</h2><p className="mt-4 max-w-xl text-base leading-7 text-zinc-600">{ru ? "Novotech помогает подобрать совместимые компоненты и подготовить решение с учётом объекта. В расчёте можно сразу учесть монтаж и пусконаладочные работы." : "Novotech vă ajută să selectați componente compatibile și să pregătiți soluția pentru obiectiv. Calculul poate include din start instalarea și punerea în funcțiune."}</p><Link className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 bg-[#3083EB] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#236FD0]" href={`/calculator/cctv?lang=${locale}`}>{ru ? "Рассчитать систему с монтажом" : "Calculează sistemul cu instalare"}<ArrowRight aria-hidden="true" className="size-4" /></Link></div><ol className="grid gap-px bg-zinc-200 sm:grid-cols-3"><li className="bg-white p-5"><span className="text-xs font-semibold text-[#625DDD]">01</span><p className="mt-4 font-semibold">{ru ? "Расчёт" : "Calcul"}</p><p className="mt-2 text-xs leading-5 text-zinc-500">{ru ? "Задача, объект, камеры и архив" : "Obiectiv, camere și arhivă"}</p></li><li className="bg-white p-5"><span className="text-xs font-semibold text-[#625DDD]">02</span><p className="mt-4 font-semibold">{ru ? "Комплектация" : "Echipare"}</p><p className="mt-2 text-xs leading-5 text-zinc-500">{ru ? "Совместимое оборудование и материалы" : "Echipamente și materiale compatibile"}</p></li><li className="bg-white p-5"><span className="text-xs font-semibold text-[#625DDD]">03</span><p className="mt-4 font-semibold">{ru ? "Монтаж" : "Instalare"}</p><p className="mt-2 text-xs leading-5 text-zinc-500">{ru ? "Установка, запуск и проверка системы" : "Montare, pornire și verificare"}</p></li></ol></section>

      <section className="border-t border-zinc-200 bg-[#151827] text-white" id="delivery"><div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8"><div><h2 className="text-2xl font-semibold">{ru ? "Уже знаете нужную модель?" : "Știți deja modelul necesar?"}</h2><p className="mt-2 text-sm text-zinc-300">{ru ? "Найдите товар по модели, артикулу или названию и проверьте актуальную розничную цену." : "Găsiți produsul după model, cod sau denumire și verificați prețul retail actual."}</p></div><Link className="inline-flex min-h-12 items-center justify-center bg-white px-6 text-sm font-semibold text-[#151827] transition-colors hover:bg-blue-50" href={publicRetailFullCatalogHref(locale)}>{ru ? "Открыть каталог" : "Deschide catalogul"}</Link></div></section>
    </main>
  </PublicRetailShell>;
}

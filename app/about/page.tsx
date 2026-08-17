import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { PublicStructuredData } from "@/src/modules/public-retail/components/PublicStructuredData";
import { publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { publicCompanyContent } from "@/src/modules/public-retail/public-company-content";
import { buildPublicMetadata, publicBreadcrumbSchema, publicLocalizedUrl, publicOrganizationSchemas } from "@/src/modules/public-retail/seo";

type Params = Promise<Record<string, string | string[] | undefined>>;

const content = {
  ru: {
    title: "Novotech — системы безопасности и профессиональное оборудование в Молдове",
    description: "Подбор, поставка, монтаж и техническая поддержка систем видеонаблюдения, контроля доступа, сигнализации и сетевой инфраструктуры в Молдове.",
    intro: "Novotech помогает частным и корпоративным клиентам собрать совместимую систему: от выбора профессионального оборудования до монтажа, настройки и поддержки после запуска.",
    sections: [
      ["Что делает Novotech", "Мы начинаем с задачи и условий объекта, подбираем совместимые компоненты, объясняем коммерческий состав решения и организуем поставку. При необходимости команда готовит монтаж, пусконаладку и дальнейшую техническую поддержку."],
      ["Профессиональное оборудование и решения", "В каталоге представлены камеры видеонаблюдения, видеорегистраторы, накопители, охранная сигнализация, контроль доступа, домофония, сетевое оборудование, кабель и монтажные материалы. Это позволяет проектировать систему как единое целое, а не как набор случайных позиций."],
      ["Dahua и другие технологии безопасности", "Оборудование Dahua представлено в каталоге Novotech наряду с другими профессиональными решениями. Конкретная модель выбирается по параметрам объекта, совместимости, актуальной цене и доступности, без неподтверждённых замен."],
      ["От оборудования до работающей системы", "Клиент может купить оборудование отдельно, воспользоваться предварительным расчётом или заказать комплексную подготовку. Состав, работы и итоговые условия подтверждаются до выполнения заказа."],
    ],
    valuesTitle: "Почему клиенты выбирают Novotech",
    values: ["Технически совместимый состав системы", "Прозрачный выбор оборудования и работ", "Профессиональный монтаж и настройка", "Поддержка после ввода системы в эксплуатацию"],
    storesTitle: "Магазины и присутствие в Молдове",
    ctaTitle: "Подберите оборудование или готовую систему",
    equipment: "Открыть каталог", calculate: "Подобрать систему", installation: "Заказать консультацию по монтажу",
  },
  ro: {
    title: "Novotech — sisteme de securitate și echipamente profesionale în Moldova",
    description: "Selectarea, livrarea, instalarea și suportul tehnic pentru supraveghere video, control acces, alarmare și infrastructură de rețea în Moldova.",
    intro: "Novotech ajută clienții persoane fizice și companiile să obțină un sistem compatibil: de la alegerea echipamentelor profesionale până la instalare, configurare și suport după punerea în funcțiune.",
    sections: [
      ["Ce face Novotech", "Pornim de la cerință și condițiile obiectivului, selectăm componente compatibile, explicăm structura comercială a soluției și organizăm livrarea. La nevoie, pregătim instalarea, punerea în funcțiune și suportul tehnic ulterior."],
      ["Echipamente și soluții profesionale", "Catalogul include camere video, recordere, unități de stocare, alarmare antiefracție, control acces, interfonie, echipamente de rețea, cabluri și materiale de montaj. Astfel, sistemul este proiectat ca un ansamblu coerent, nu ca o listă de produse întâmplătoare."],
      ["Dahua și alte tehnologii de securitate", "Echipamentele Dahua sunt prezente în catalogul Novotech alături de alte soluții profesionale. Modelul concret este ales după obiectiv, compatibilitate, prețul actual și disponibilitate, fără înlocuiri neconfirmate."],
      ["De la echipament la un sistem funcțional", "Clientul poate cumpăra separat echipamente, poate folosi calculul preliminar sau poate solicita pregătirea completă a soluției. Componența, lucrările și condițiile finale sunt confirmate înainte de executare."],
    ],
    valuesTitle: "De ce clienții aleg Novotech",
    values: ["Componente tehnic compatibile", "Selecție transparentă a echipamentelor și lucrărilor", "Instalare și configurare profesională", "Suport după punerea sistemului în funcțiune"],
    storesTitle: "Magazine și prezență în Moldova",
    ctaTitle: "Alegeți echipamentul sau sistemul potrivit",
    equipment: "Deschide catalogul", calculate: "Calculează sistemul", installation: "Solicită consultanță pentru instalare",
  },
} as const;

export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const locale = publicRetailLocale((await searchParams).lang);
  const title = locale === "ro" ? "Despre Novotech | Sisteme de securitate" : "О компании Novotech | Системы безопасности";
  return buildPublicMetadata({ locale, path: "/about", title, description: content[locale].description });
}

export default async function AboutPage({ searchParams }: { searchParams: Params }) {
  const locale = publicRetailLocale((await searchParams).lang);
  const copy = content[locale];
  const ru = locale === "ru";
  const schemas = [
    ...publicOrganizationSchemas(locale),
    publicBreadcrumbSchema([
      { name: ru ? "Главная" : "Principală", url: publicLocalizedUrl("/", locale) },
      { name: ru ? "О компании" : "Despre companie", url: publicLocalizedUrl("/about", locale) },
    ]),
    { "@type": "AboutPage", "@id": `${publicLocalizedUrl("/about", locale)}#about-page`, name: copy.title, description: copy.description, inLanguage: locale, url: publicLocalizedUrl("/about", locale), about: { "@id": `${publicLocalizedUrl("/", "ru")}#organization` } },
  ];

  return <PublicRetailShell languagePath="/about" locale={locale}>
    <PublicStructuredData data={schemas} />
    <main>
      <section className="relative flex min-h-[520px] items-end overflow-hidden border-b border-zinc-200 bg-zinc-950 text-white">
        <Image alt={ru ? "Подготовка профессиональной системы безопасности" : "Pregătirea unui sistem profesional de securitate"} className="object-cover" fill preload sizes="100vw" src="/retail/security-installation-hero.webp" />
        <div aria-hidden="true" className="absolute inset-0 bg-black/65" />
        <div className="relative mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <p className="text-sm font-semibold text-blue-300">Novotech Moldova</p>
          <h1 className="mt-3 max-w-4xl text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">{copy.title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-zinc-200">{copy.intro}</p>
        </div>
      </section>
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        {copy.sections.map(([title, text], index) => <section className="grid gap-4 border-b border-zinc-200 py-9 md:grid-cols-[280px_minmax(0,1fr)]" key={title}><p className="text-xs font-semibold text-blue-700">0{index + 1}</p><div><h2 className="text-2xl font-semibold">{title}</h2><p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600">{text}</p></div></section>)}
        <section className="py-10"><h2 className="text-2xl font-semibold">{copy.valuesTitle}</h2><ul className="mt-6 grid gap-3 sm:grid-cols-2">{copy.values.map((value) => <li className="flex gap-3 border-t border-zinc-200 pt-4 text-sm leading-6" key={value}><CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-blue-700" />{value}</li>)}</ul></section>
      </div>
      <section className="border-y border-zinc-200 bg-zinc-50"><div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8"><h2 className="text-2xl font-semibold">{copy.storesTitle}</h2><div className="mt-5 grid gap-px bg-zinc-200 md:grid-cols-2">{publicCompanyContent.stores.map((store) => <a className="flex min-h-20 items-center gap-3 bg-white p-5 text-sm font-semibold hover:text-blue-700" href={store.mapsHref} key={store.mapsHref} rel="noopener noreferrer" target="_blank"><MapPin aria-hidden="true" className="size-5 text-blue-700" /><span>{store.city[locale]}<span className="mt-1 block font-normal text-zinc-600">{store.address[locale]}</span></span></a>)}</div></div></section>
      <section className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 lg:px-8"><h2 className="max-w-3xl text-3xl font-semibold">{copy.ctaTitle}</h2><div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap"><Link className="inline-flex min-h-12 items-center justify-center gap-2 bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800" href={`/catalog?lang=${locale}&view=all`}>{copy.equipment}<ArrowRight className="size-4" /></Link><Link className="inline-flex min-h-12 items-center justify-center border border-blue-700 px-5 text-sm font-semibold text-blue-800 hover:bg-blue-50" href={`/calculator/cctv?lang=${locale}`}>{copy.calculate}</Link><Link className="inline-flex min-h-12 items-center justify-center border border-zinc-300 px-5 text-sm font-semibold hover:border-blue-700" href={`/installation?lang=${locale}#request`}>{copy.installation}</Link></div></section>
    </main>
  </PublicRetailShell>;
}

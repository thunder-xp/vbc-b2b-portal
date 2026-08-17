import type { Metadata } from "next";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { PublicStructuredData } from "@/src/modules/public-retail/components/PublicStructuredData";
import { publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { buildPublicMetadata, publicArticleSchema, publicBreadcrumbSchema, publicLocalizedUrl } from "@/src/modules/public-retail/seo";

type Params = Promise<Record<string, string | string[] | undefined>>;

function content(locale: "ru" | "ro") {
  return locale === "ru" ? {
    title: "Как подобрать видеонаблюдение для дома или бизнеса",
    description: "Практическое руководство по выбору камер, видеорегистратора, глубины архива, сети, питания и подготовке монтажа системы CCTV.",
    intro: "Надёжная система начинается не с конкретной камеры, а с задач: какие зоны нужно видеть, насколько подробно и как долго хранить записи.",
    sections: [
      ["1. Определите зоны и задачи", "Отметьте входы, периметр, кассовые или складские зоны. Для каждой зоны решите, нужен общий обзор или распознавание деталей."],
      ["2. Выберите камеры под условия", "В помещении важны угол обзора и освещение. На улице учитывайте корпус, температуру, ночную съёмку и встречный свет."],
      ["3. Рассчитайте архив", "Глубина архива зависит от числа камер, разрешения, частоты кадров и режима записи. Для расчёта используйте реальные требования, а не максимальные характеристики."],
      ["4. Проверьте сеть и питание", "PoE упрощает подключение, но коммутатор и кабель должны соответствовать расстояниям и мощности камер."],
      ["5. Подготовьте монтаж", "До покупки проверьте трассы кабеля, точки питания, место регистратора и доступ для обслуживания."],
    ],
  } : {
    title: "Cum alegeți supravegherea video pentru casă sau afacere",
    description: "Ghid practic pentru alegerea camerelor, recorderului, arhivei, rețelei, alimentării și pregătirea instalării unui sistem CCTV.",
    intro: "Un sistem fiabil pornește de la obiective: ce zone trebuie observate, cât de detaliat și cât timp trebuie păstrate înregistrările.",
    sections: [
      ["1. Stabiliți zonele și obiectivele", "Marcați intrările, perimetrul, casele sau depozitul. Decideți pentru fiecare zonă dacă aveți nevoie de vedere generală sau de detalii."],
      ["2. Alegeți camerele potrivite", "La interior contează unghiul și iluminarea. La exterior luați în calcul carcasa, temperatura, vederea nocturnă și lumina frontală."],
      ["3. Calculați arhiva", "Durata arhivei depinde de numărul camerelor, rezoluție, cadre și modul de înregistrare. Folosiți cerințe reale."],
      ["4. Verificați rețeaua și alimentarea", "PoE simplifică instalarea, dar switch-ul și cablul trebuie să corespundă distanțelor și consumului camerelor."],
      ["5. Pregătiți instalarea", "Înainte de cumpărare verificați traseele, alimentarea, locul recorderului și accesul pentru mentenanță."],
    ],
  };
}

export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const locale = publicRetailLocale((await searchParams).lang);
  const copy = content(locale);
  const title = locale === "ro" ? "Cum alegeți supravegherea video | Novotech" : "Как выбрать видеонаблюдение | Novotech";
  return buildPublicMetadata({ locale, path: "/guides/cctv-selection", title, description: copy.description });
}

export default async function CctvGuidePage({ searchParams }: { searchParams: Params }) {
  const locale = publicRetailLocale((await searchParams).lang);
  const ru = locale === "ru";
  const copy = content(locale);
  const url = "/guides/cctv-selection";
  return <PublicRetailShell languagePath={url} locale={locale}><PublicStructuredData data={[
    publicArticleSchema({ locale, path: url, title: copy.title, description: copy.description }),
    publicBreadcrumbSchema([{ name: ru ? "Главная" : "Principală", url: publicLocalizedUrl("/", locale) }, { name: ru ? "Руководства" : "Ghiduri", url: publicLocalizedUrl("/guides", locale) }, { name: copy.title, url: publicLocalizedUrl(url, locale) }]),
  ]} /><main className="mx-auto max-w-[900px] px-4 py-12 sm:px-6 lg:px-8"><p className="public-brand-eyebrow text-xs font-semibold uppercase">CCTV</p><h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">{copy.title}</h1><p className="mt-5 text-lg leading-8 text-zinc-600">{copy.intro}</p><div className="mt-10 grid gap-8">{copy.sections.map(([title, text]) => <section className="border-t border-zinc-200 pt-6" key={title}><h2 className="flex gap-3 text-xl font-semibold"><CheckCircle2 aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-blue-700" />{title}</h2><p className="mt-3 pl-9 text-base leading-7 text-zinc-600">{text}</p></section>)}</div><aside className="mt-12 border border-blue-200 bg-blue-50 p-6"><h2 className="text-xl font-semibold">{ru ? "Получите ориентировочный состав системы" : "Primiți configurația orientativă"}</h2><p className="mt-2 text-sm leading-6 text-zinc-700">{ru ? "Онлайн-расчёт поможет определить камеры, запись, хранение и основные монтажные материалы." : "Calculul online ajută la definirea camerelor, înregistrării, stocării și materialelor principale."}</p><Link className="public-primary-action mt-5 inline-flex min-h-12 items-center gap-2 px-5 text-sm font-semibold" href={`/calculator/cctv?lang=${locale}`}>{ru ? "Рассчитать систему" : "Calculează sistemul"}<ArrowRight aria-hidden="true" className="size-4" /></Link></aside></main></PublicRetailShell>;
}

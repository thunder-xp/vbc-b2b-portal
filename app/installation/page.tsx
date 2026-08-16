import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, Phone } from "lucide-react";
import Link from "next/link";

import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { PublicInstallationLeadForm } from "@/src/modules/public-retail/components/PublicInstallationLeadForm";
import { PublicStructuredData } from "@/src/modules/public-retail/components/PublicStructuredData";
import { publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { publicCompanyContent } from "@/src/modules/public-retail/public-company-content";
import { buildPublicMetadata, publicBreadcrumbSchema, publicInstallationServiceSchema, publicLocalizedUrl, publicOrganizationSchemas } from "@/src/modules/public-retail/seo";
import { normalizePublicInstallationSourcePath } from "@/src/modules/retail-marketplace/validation";

type Params = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const locale = publicRetailLocale((await searchParams).lang);
  return buildPublicMetadata({
    locale,
    path: "/installation",
    title: locale === "ro" ? "Instalarea sistemelor de securitate în Moldova | Novotech" : "Монтаж систем безопасности в Молдове | Novotech",
    description: locale === "ro" ? "Selecție, instalare și configurare profesională pentru supraveghere video și sisteme de securitate." : "Подбор, профессиональный монтаж и настройка видеонаблюдения и систем безопасности.",
  });
}

export default async function InstallationPage({ searchParams }: { searchParams: Params }) {
  const query = await searchParams;
  const locale = publicRetailLocale(query.lang);
  const ru = locale === "ru";
  const objectType = single(query.object) ?? "other";
  const systemType = single(query.system) ?? "cctv";
  const sourcePath = normalizePublicInstallationSourcePath(single(query.from));
  const steps = ru
    ? [["01", "Задача и объект", "Уточняем назначение, зоны контроля и условия объекта."], ["02", "Расчёт системы", "Подбираем совместимые компоненты и необходимые материалы."], ["03", "Согласование", "Уточняем состав, стоимость оборудования и условия работ."], ["04", "Монтаж и настройка", "Устанавливаем, проверяем и настраиваем готовую систему."]]
    : [["01", "Obiectivul", "Clarificăm scopul, zonele de control și condițiile."], ["02", "Calculul sistemului", "Selectăm componente compatibile și materialele necesare."], ["03", "Coordonarea", "Confirmăm configurația, echipamentele și condițiile lucrărilor."], ["04", "Instalare și configurare", "Montăm, verificăm și configurăm sistemul."]];
  const schemas = [
    ...publicOrganizationSchemas(locale),
    publicInstallationServiceSchema(locale),
    publicBreadcrumbSchema([
      { name: ru ? "Главная" : "Principală", url: publicLocalizedUrl("/", locale) },
      { name: ru ? "Монтаж" : "Instalare", url: publicLocalizedUrl("/installation", locale) },
    ]),
  ];

  return <PublicRetailShell languagePath="/installation" locale={locale}>
    <PublicStructuredData data={schemas} />
    <main>
      <section className="border-b border-zinc-200 bg-zinc-950 text-white"><div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-20"><p className="text-sm font-semibold text-blue-300">{ru ? "Профессиональная установка" : "Instalare profesională"}</p><h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">{ru ? "Система безопасности, подготовленная для вашего объекта" : "Un sistem de securitate pregătit pentru obiectivul dvs."}</h1><p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300">{ru ? "Novotech помогает выбрать оборудование, проверить совместимость, подготовить монтаж и настроить систему." : "Novotech vă ajută să alegeți echipamentul, să verificați compatibilitatea, să pregătiți instalarea și să configurați sistemul."}</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><Link className="public-primary-action inline-flex min-h-12 items-center justify-center gap-2 px-5 text-sm font-semibold" href={`/calculator/cctv?lang=${locale}`}>{ru ? "Рассчитать видеонаблюдение" : "Calculează sistemul CCTV"}<ArrowRight aria-hidden="true" className="size-4" /></Link><a className="inline-flex min-h-12 items-center justify-center gap-2 border border-zinc-500 px-5 text-sm font-semibold hover:border-white" href={publicCompanyContent.customerPhone.href}><Phone aria-hidden="true" className="size-4" />{publicCompanyContent.customerPhone.display}</a></div></div></section>
      <section className="border-b border-zinc-200 bg-zinc-50"><div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6 lg:px-8"><h2 className="text-2xl font-semibold">{ru ? "Что входит в подготовку" : "Ce include pregătirea"}</h2><ul className="mt-6 grid gap-4 text-sm text-zinc-700 sm:grid-cols-2 lg:grid-cols-4">{(ru ? ["Подбор совместимого оборудования", "Расчёт кабелей, питания и хранения", "Проверка условий объекта", "Монтаж, запуск и базовая настройка"] : ["Selectarea echipamentelor compatibile", "Calculul cablurilor, alimentării și stocării", "Verificarea condițiilor obiectivului", "Instalare, pornire și configurare de bază"]).map((item) => <li className="flex gap-3" key={item}><CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-blue-700" />{item}</li>)}</ul></div></section>
      <section className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6 lg:px-8"><h2 className="text-3xl font-semibold">{ru ? "Как проходит работа" : "Cum decurge colaborarea"}</h2><ol className="mt-8 grid gap-px bg-zinc-200 sm:grid-cols-2 lg:grid-cols-4">{steps.map(([number, title, text]) => <li className="bg-white p-5" key={number}><span className="text-xs font-semibold text-blue-700">{number}</span><h3 className="mt-4 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-zinc-600">{text}</p></li>)}</ol></section>
      <section className="border-y border-zinc-200 bg-zinc-50" id="request"><div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:px-8"><div><p className="text-sm font-semibold text-blue-700">{ru ? "Заявка на консультацию" : "Cerere de consultanță"}</p><h2 className="mt-2 text-3xl font-semibold">{ru ? "Расскажите об объекте" : "Descrieți obiectivul"}</h2><p className="mt-4 text-sm leading-6 text-zinc-600">{ru ? "Оставьте контакт и основные параметры. Специалист Novotech уточнит задачу и предложит следующий шаг." : "Lăsați datele de contact și parametrii principali. Un specialist Novotech va clarifica cerința și va propune următorul pas."}</p></div><div className="border border-zinc-200 bg-white p-5 sm:p-6"><PublicInstallationLeadForm locale={locale} objectType={objectType} sourcePath={sourcePath} submissionKey={crypto.randomUUID()} systemType={systemType} /></div></div></section>
      <section className="mx-auto grid max-w-[1200px] gap-6 px-4 py-12 sm:px-6 md:grid-cols-2 lg:px-8"><div><h2 className="text-xl font-semibold">{ru ? "Удобнее связаться напрямую?" : "Preferați contactul direct?"}</h2><p className="mt-2 text-sm leading-6 text-zinc-600">{ru ? "Позвоните в рабочее время или откройте все контакты Novotech." : "Sunați-ne în timpul programului sau consultați toate contactele Novotech."}</p></div><div className="flex flex-col gap-3 sm:flex-row md:justify-end"><a className="inline-flex min-h-11 items-center justify-center gap-2 border border-zinc-300 px-4 text-sm font-semibold hover:border-blue-700" href={publicCompanyContent.customerPhone.href}><Phone aria-hidden="true" className="size-4" />{publicCompanyContent.customerPhone.display}</a><Link className="public-brand-link inline-flex min-h-11 items-center justify-center gap-2 text-sm font-semibold" href={`/contacts?lang=${locale}`}>{ru ? "Все контакты" : "Toate contactele"}<ArrowRight aria-hidden="true" className="size-4" /></Link></div></section>
      <section className="border-t border-zinc-200 bg-zinc-50"><div className="mx-auto max-w-[900px] px-4 py-12 sm:px-6 lg:px-8"><h2 className="text-2xl font-semibold">{ru ? "Частые вопросы" : "Întrebări frecvente"}</h2><div className="mt-6 divide-y divide-zinc-200 border-y border-zinc-200">{(ru ? [["Нужно ли заранее выбрать оборудование?", "Нет. Мы можем начать с задачи и условий объекта, а состав системы уточнить после консультации."], ["Можно ли заказать только монтаж?", "Да, если оборудование совместимо и его состояние позволяет выполнить работы безопасно."], ["Когда будет известна стоимость?", "Ориентир можно получить после первичного уточнения; итог подтверждается по составу и условиям объекта."]] : [["Trebuie să aleg echipamentul în prealabil?", "Nu. Putem porni de la cerință și condițiile obiectivului, apoi clarificăm configurația."], ["Pot solicita doar instalarea?", "Da, dacă echipamentul este compatibil și starea lui permite executarea sigură a lucrărilor."], ["Când voi cunoaște costul?", "O estimare poate fi oferită după clarificarea inițială; totalul se confirmă conform configurației și obiectivului."]]).map(([question, answer]) => <details className="group py-4" key={question}><summary className="min-h-11 cursor-pointer list-none font-semibold">{question}</summary><p className="pb-2 pr-6 text-sm leading-6 text-zinc-600">{answer}</p></details>)}</div></div></section>
    </main>
  </PublicRetailShell>;
}

function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

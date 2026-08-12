import { AlertCircle, ArrowLeft, CheckCircle2, ImageOff } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { PublicRetailAddSystemButton } from "@/src/modules/public-retail/components/PublicRetailAddSystemButton";
import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { availabilityCopy, availabilityTone, formatRetailPrice, publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { getPublicCctvCalculatorService } from "@/src/modules/public-retail/server";
import {
  publicCctvInputFromSearchParams,
  type PublicCctvCalculatorResult,
  type PublicCctvResultLine,
} from "@/src/modules/public-retail/services/public-cctv-calculator.service";

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const locale = publicRetailLocale((await searchParams).lang);
  return {
    title: locale === "ro" ? "Calcul preliminar CCTV | Novotech" : "Предварительный расчёт CCTV | Novotech",
    description: locale === "ro"
      ? "Sistemul de supraveghere video selectat şi costul estimativ cu amănuntul."
      : "Подобранная система видеонаблюдения и ориентировочная розничная стоимость.",
    robots: { index: false, follow: false },
  };
}

const GROUPS: PublicCctvResultLine["group"][] = ["cameras", "recorder", "archive", "network", "materials", "works"];

export default async function PublicCctvResultPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const locale = (Array.isArray(query.lang) ? query.lang[0] : query.lang) === "ro" ? "ro" : "ru";
  let input;
  let result: PublicCctvCalculatorResult | null = null;
  try {
    input = publicCctvInputFromSearchParams(query);
    result = await getPublicCctvCalculatorService().calculate(input);
  } catch (error) {
    console.error({ event: "public_cctv_calculation_failed", errorName: error instanceof Error ? error.name : typeof error });
  }
  console.info({
    event: "public_cctv_calculation_completed",
    status: result?.status ?? "failed",
    calculationPerformance: result?.performance ?? null,
  });
  const effectiveLocale = input?.locale ?? locale;
  const ru = effectiveLocale === "ru";
  const modifyHref = `/calculator/cctv?${safeQueryString(query)}`;
  const installationRequested = Boolean(input && (
    input.cameraInstallationRequested || input.cableLayingRequested
    || input.commissioningRequested || input.remoteViewingRequested
  ));
  const cartItems = result?.status === "resolved"
    ? result.lines.flatMap((line) => line.kind === "product" && line.product ? [{
      publicProductId: line.product.id,
      quantity: line.quantity,
      commercialGroup: line.group === "materials" ? "materials" as const : "equipment" as const,
    }] : [])
    : [];
  const installationIntent = input && installationRequested ? {
    cameraInstallation: input.cameraInstallationRequested,
    cableLaying: input.cableLayingRequested,
    commissioning: input.commissioningRequested,
    remoteViewing: input.remoteViewingRequested,
  } : null;

  return <PublicRetailShell languagePath="/calculator/cctv/result" locale={effectiveLocale}>
    <main className="min-h-[calc(100vh-4rem)] bg-zinc-50" lang={effectiveLocale}>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        {!result || !input ? <FailureState locale={effectiveLocale} modifyHref={modifyHref} /> : <>
          <header className="border-b border-zinc-200 pb-8">
            <div className={`inline-flex min-h-9 items-center gap-2 px-3 text-sm font-semibold ${result.status === "resolved" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{result.status === "resolved" ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}{result.status === "resolved" ? (ru ? "Система подобрана" : "Sistemul este selectat") : (ru ? "Нужно уточнить конфигурацию" : "Configurația trebuie verificată")}</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{ru ? "Мы подобрали систему" : "Am selectat sistemul"}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-600">{ru ? `${result.cameraCount} камер: ${input.indoorCameraCount} внутри (${result.indoorResolutionMp} Мп) и ${input.outdoorCameraCount} снаружи (${result.outdoorResolutionMp} Мп). Архив — ${input.archiveDays} дней. ${installationRequested ? "Монтаж и настройка включены в объём работ." : "Монтаж не включён."}` : `${result.cameraCount} camere: ${input.indoorCameraCount} în interior (${result.indoorResolutionMp} MP) și ${input.outdoorCameraCount} în exterior (${result.outdoorResolutionMp} MP). Arhivă — ${input.archiveDays} zile. ${installationRequested ? "Instalarea și configurarea sunt incluse în volumul lucrărilor." : "Instalarea nu este inclusă."}`}</p>
          </header>

          {result.unresolved.length ? <section className="mt-8 border-l-4 border-amber-500 bg-amber-50 p-5"><h2 className="font-semibold">{ru ? "Не удалось подобрать одну из позиций" : "Una dintre poziții nu a putut fi selectată"}</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-950">{result.unresolved.map((item) => <li key={item}>{item}</li>)}</ul><p className="mt-3 text-sm text-amber-900">{ru ? "Мы не подменяем её похожим товаром без подтверждённой совместимости." : "Nu o înlocuim cu un produs similar fără compatibilitate confirmată."}</p></section> : null}

          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <div className="space-y-10">{GROUPS.map((group) => {
              const lines = result.lines.filter((line) => line.group === group);
              if (!lines.length) return null;
              return <section key={group}><h2 className="text-xl font-semibold">{groupLabel(group, input.locale)}</h2><div className="mt-4 divide-y divide-zinc-200 border-y border-zinc-200 bg-white">{lines.map((line) => <ResultLine key={line.key} line={line} locale={input.locale} />)}</div></section>;
            })}<section><h2 className="text-xl font-semibold">{ru ? "Почему выбрана эта конфигурация" : "De ce a fost aleasă această configurație"}</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-zinc-700">{result.explanations.map((explanation) => <li className="flex gap-3" key={explanation}><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" />{explanation}</li>)}</ul></section></div>

            <aside className="border border-zinc-200 bg-white p-5 lg:sticky lg:top-24"><p className="text-xs font-semibold uppercase text-emerald-700">{ru ? "Предварительный расчёт" : "Calcul preliminar"}</p><h2 className="mt-2 text-xl font-semibold">{ru ? "Ориентировочная стоимость системы" : "Costul estimativ al sistemului"}</h2><dl className="mt-5 space-y-3 text-sm"><TotalRow label={ru ? "Оборудование" : "Echipamente"} locale={input.locale} value={result.totals.equipment} currency={result.totals.currency} /><TotalRow label={ru ? "Материалы" : "Materiale"} locale={input.locale} value={result.totals.materials} currency={result.totals.currency} />{installationRequested ? <div className="flex justify-between gap-3"><dt>{ru ? "Монтаж" : "Instalare"}</dt><dd className="text-right text-zinc-500">{ru ? "Рассчитывается далее" : "Se calculează ulterior"}</dd></div> : null}</dl><div className="mt-5 border-t border-zinc-200 pt-5"><div className="flex items-end justify-between gap-4"><span className="font-semibold">{ru ? "Итого" : "Total"}</span><strong className="text-2xl tabular-nums">{result.totals.total !== null && result.totals.currency ? formatRetailPrice(result.totals.total, result.totals.currency, input.locale) : "—"}</strong></div></div><p className="mt-5 text-xs leading-5 text-zinc-500">{installationRequested ? (ru ? "Финальный объём монтажа и длина кабеля уточняются после проверки объекта." : "Volumul final al instalării și lungimea cablului se confirmă după verificarea obiectivului.") : (ru ? "Финальная длина кабеля уточняется после проверки объекта." : "Lungimea finală a cablului se confirmă după verificarea obiectivului.")}</p><div className="mt-6 grid gap-3">{result.status === "resolved" && cartItems.length > 0 ? <PublicRetailAddSystemButton installationIntent={installationIntent} items={cartItems} locale={input.locale} /> : null}<Link className="inline-flex min-h-12 items-center justify-center border border-zinc-300 px-4 text-sm font-semibold" href={`/catalog?lang=${input.locale}`}>{ru ? "Перейти к каталогу" : "Deschide catalogul"}</Link><Link className="inline-flex min-h-12 items-center justify-center gap-2 border border-zinc-300 px-4 text-sm font-semibold" href={modifyHref}><ArrowLeft className="size-4" />{ru ? "Изменить параметры" : "Modifică parametrii"}</Link></div></aside>
          </div>
        </>}
      </div>
    </main>
  </PublicRetailShell>;
}

function ResultLine({ line, locale }: { line: PublicCctvResultLine; locale: "ru" | "ro" }) {
  const ru = locale === "ru";
  if (line.kind === "work") return <div className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><p className="font-semibold">{line.label}</p><p className="mt-1 text-sm text-zinc-500">{ru ? "Стоимость будет рассчитана на следующем этапе." : "Costul va fi calculat la etapa următoare."}</p></div><p className="font-semibold tabular-nums">{line.quantity} {line.unitLabel}</p></div>;
  if (!line.product) return <div className="flex min-h-28 items-center gap-4 p-4"><div className="grid size-20 shrink-0 place-items-center bg-zinc-100"><ImageOff className="size-7 text-zinc-300" /></div><div><p className="font-semibold">{line.label}</p><p className="mt-1 text-sm text-amber-700">{ru ? "Нужно уточнить позицию" : "Poziția trebuie verificată"}</p></div></div>;
  return <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-4 p-4 sm:grid-cols-[88px_minmax(0,1fr)_auto] sm:items-center"><Link className="relative grid aspect-square place-items-center overflow-hidden bg-zinc-100" href={`/products/${line.product.slug}?lang=${locale}`}>{line.product.image ? <Image alt={line.product.image.alt} className="object-contain p-2" fill sizes="88px" src={line.product.image.url} /> : <ImageOff className="size-7 text-zinc-300" />}</Link><div className="min-w-0"><p className="text-xs font-semibold uppercase text-zinc-500">{line.label}</p><Link className="mt-1 block font-semibold leading-5 hover:text-emerald-700" href={`/products/${line.product.slug}?lang=${locale}`}>{line.product.name}</Link><p className={`mt-2 text-sm font-medium ${availabilityTone(line.product.availability)}`}>{availabilityCopy[locale][line.product.availability]}</p><p className="mt-2 text-sm text-zinc-600">{line.quantity} {line.unitLabel} × {formatRetailPrice(line.product.price.amount, line.product.price.currency, locale)}</p></div><p className="col-start-2 text-lg font-semibold tabular-nums sm:col-start-auto">{line.amount !== null && line.currency ? formatRetailPrice(line.amount, line.currency, locale) : "—"}</p></div>;
}

function TotalRow({ currency, label, locale, value }: { currency: string | null; label: string; locale: "ru" | "ro"; value: number | null }) { return <div className="flex justify-between gap-3"><dt>{label}</dt><dd className="font-semibold tabular-nums">{value !== null && currency ? formatRetailPrice(value, currency, locale) : "—"}</dd></div>; }
function FailureState({ locale, modifyHref }: { locale: "ru" | "ro"; modifyHref: string }) { const ru = locale === "ru"; return <section className="mx-auto max-w-xl border border-zinc-200 bg-white p-8 text-center"><AlertCircle className="mx-auto size-10 text-amber-600" /><h1 className="mt-4 text-2xl font-semibold">{ru ? "Не удалось выполнить расчёт" : "Calculul nu a putut fi efectuat"}</h1><p className="mt-3 text-sm leading-6 text-zinc-600">{ru ? "Проверьте параметры и повторите попытку. Мы не покажем неподтверждённую конфигурацию." : "Verificați parametrii și încercați din nou. Nu vom afișa o configurație neconfirmată."}</p><Link className="mt-6 inline-flex min-h-12 items-center justify-center bg-emerald-700 px-5 text-sm font-semibold text-white" href={modifyHref}>{ru ? "Вернуться к параметрам" : "Înapoi la parametri"}</Link></section>; }
function groupLabel(group: PublicCctvResultLine["group"], locale: "ru" | "ro") { const labels = locale === "ro" ? { cameras: "Camere", recorder: "Videorecorder", archive: "Arhivă", network: "Rețea / PoE", materials: "Materiale", works: "Instalare și configurare" } : { cameras: "Камеры", recorder: "Видеорегистратор", archive: "Архив", network: "Сеть / PoE", materials: "Материалы", works: "Монтаж и настройка" }; return labels[group]; }
function safeQueryString(query: Record<string, string | string[] | undefined>) { const result = new URLSearchParams(); for (const [key, value] of Object.entries(query)) { const scalar = Array.isArray(value) ? value[0] : value; if (scalar && /^[a-zA-Z0-9.-]+$/.test(scalar) && key.length < 40) result.set(key, scalar); } return result.toString(); }

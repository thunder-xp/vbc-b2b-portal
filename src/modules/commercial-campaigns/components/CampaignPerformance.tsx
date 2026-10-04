import Link from "next/link";
import { CAMPAIGN_MECHANIC_LABELS, observedRate, type CampaignPerformanceQuery, type CampaignPerformanceSummary } from "../performance";

export function CampaignResultsFilter({ query, versions = [] }: { query: CampaignPerformanceQuery; versions?: number[] }) {
  return <form method="get" className="grid min-w-0 gap-3 rounded-md border bg-white p-3 sm:grid-cols-2 xl:grid-cols-5">
    <label className="grid min-w-0 gap-1 text-xs">Период<select className="min-h-10 min-w-0 rounded border px-2 text-sm" name="period" defaultValue={query.period ?? "lifetime"}><option value="lifetime">Весь срок предложения</option><option value="7">Последние 7 дней</option><option value="30">Последние 30 дней</option><option value="custom">Свой период · UTC</option></select></label>
    <label className="grid min-w-0 gap-1 text-xs">С<input className="min-h-10 min-w-0 rounded border px-2 text-sm" type="date" name="from" defaultValue={query.from} /></label>
    <label className="grid min-w-0 gap-1 text-xs">По<input className="min-h-10 min-w-0 rounded border px-2 text-sm" type="date" name="to" defaultValue={query.to} /></label>
    {versions.length ? <label className="grid min-w-0 gap-1 text-xs">Публикация<select className="min-h-10 min-w-0 rounded border px-2 text-sm" name="version" defaultValue={query.version ?? ""}><option value="">Все версии</option>{versions.map(version => <option key={version} value={version}>Версия {version}</option>)}</select></label> : <span />}
    <button className="min-h-10 self-end rounded bg-zinc-900 px-3 text-sm font-semibold text-white" type="submit">Применить</button>
  </form>;
}

export function CampaignPerformance({ summary: s }: { summary: CampaignPerformanceSummary }) {
  const counts: Array<[string, number | string | null]> = [
    ["Просмотры предложения", s.offerViews], ["Компании, просмотревшие", s.viewingCompanies],
    ["Компании с действием", s.interactingCompanies], ["Наблюдаемая квалификация", s.qualifiedCompanies],
    ["Компании с PROMO в заказе", s.benefitCompanies], ["Заказы с атрибуцией", s.attributedOrders],
    ["Строки с PROMO", s.attributedLines], ["Единицы с PROMO", s.attributedUnits],
    ["SKU с PROMO", s.participatingSkus], ["Единицы с PROMO / заказ", s.attributedOrders ? (s.attributedUnits / s.attributedOrders).toFixed(1) : null],
  ];
  return <section className="min-w-0 space-y-4" aria-label="Результаты предложения">
    <p className="text-sm text-zinc-600">{CAMPAIGN_MECHANIC_LABELS[s.mechanicType] ?? s.mechanicType} · {s.publicationVersion ? `Публикация ${s.publicationVersion}` : "Все публикации"} · Аудитория выбранной / текущей версии: {s.audienceCompanies} компаний</p>
    <p className="text-xs text-zinc-500">{date(s.period.from)} — {date(s.period.to)} · UTC. Данные отражают атрибуцию, а не причинность или дополнительную выручку.</p>
    <p className="rounded border border-zinc-200 bg-zinc-50 p-3 text-sm">{s.viewsStartedAt ? `Учёт просмотров доступен с ${date(s.viewsStartedAt)}.` : "Учёт просмотров ещё не активирован."} {!s.viewCoverageComplete ? "Историческая часть периода не покрыта: просмотры не восстановлены из покупок." : "Период покрыт учётом просмотров."}</p>
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">{counts.map(([label, value]) => <div className="min-w-0 border-b pb-2" key={label}><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 text-lg font-semibold">{value ?? "Нет данных"}</dd></div>)}</dl>
    <div className="space-y-2 text-sm"><p>Просмотр → действие в наблюдаемой группе: <b>{observedRate(s.viewedInteractingCompanies, s.viewingCompanies)}</b> · Просмотр → наблюдаемая квалификация: <b>{observedRate(s.viewedQualifiedCompanies, s.viewingCompanies)}</b></p><p className="text-xs text-zinc-500">Действие / квалификация после первого зафиксированного просмотра в выбранном периоде. Причинный эффект не утверждается. Квалификация подтверждается успешным действием с выполненным условием или сохранённой PROMO-строкой заказа. Изменения корзины без такого действия не являются полным переписным учётом.</p></div>
    <dl className="space-y-3 border-t pt-3"><Money label="Сумма заказов с атрибуцией" values={s.attributedOrderValue} /><Money label="Стоимость строк с PROMO" values={s.campaignPricedLineValue} /></dl>
    <p className="text-xs text-zinc-500">Учитываются только сохранённые заказы после успешной отправки с неизменяемым подтверждением цены PROMO. Заказ считается один раз в предложении; весь заказ может содержать обычные строки. Суммы разных предложений не следует складывать: один заказ может относиться к нескольким предложениям.</p>
    <div className="border-t pt-3 text-sm"><p>Добавления товара: {s.addActions} · Собрать комплект: {s.completeKitActions} · Добавления reward: {s.rewardAddActions}</p><p className="mt-1">Квалификация в действии: {s.actionQualifiedCompanies} компаний · Покупки reward: {s.rewardPurchasedLines} строк / {s.rewardPurchasedUnits} единиц</p>{s.qualifyingSpendUsd ? <p className="mt-1">Закупка по условию на момент заказа: {s.qualifyingSpendUsd.min} — {s.qualifyingSpendUsd.max} USD</p> : null}</div>
    <p className="text-xs text-zinc-500">GP и наблюдаемая разница базовой/PROMO-цены недоступны: в заказе нет полного авторитетного снимка себестоимости и базовой цены. Исторический просмотр оформления заказа и категорийная ширина также не восстановлены.</p>
  </section>;
}

export function CampaignResultsComparison({ summaries }: { summaries: CampaignPerformanceSummary[] }) {
  return <div className="grid min-w-0 gap-3 lg:grid-cols-2">{summaries.map(s => <article className="min-w-0 rounded border bg-white p-4" key={s.campaignId}>
    <Link className="break-words font-semibold text-emerald-800" href={`/admin/commercial/campaigns/${s.campaignId}/results`}>{s.name}</Link>
    <p className="mt-1 text-xs text-zinc-500">{CAMPAIGN_MECHANIC_LABELS[s.mechanicType] ?? s.mechanicType}</p>
    <p className="mt-2 text-sm">Компании, просмотревшие: {s.viewingCompanies ?? "Нет данных"} · Квалификация: {s.qualifiedCompanies} · Заказы: {s.attributedOrders}</p>
    <dl className="mt-3"><Money label="Сумма заказов с атрибуцией" values={s.attributedOrderValue} /></dl>
  </article>)}</div>;
}
function Money({ label, values }: { label: string; values: CampaignPerformanceSummary["attributedOrderValue"] }) {
  return <div className="min-w-0"><dt className="text-xs text-zinc-500">{label}</dt><dd className="break-words font-semibold">{values.length ? values.map(v => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(v.amount)} ${v.currency}`).join(" · ") : "Нет атрибутированных сумм"}</dd></div>;
}
function date(value: string) { return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeZone: "UTC" }).format(new Date(value)); }

import Link from "next/link";
import { redirect } from "next/navigation";

import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";
import { listCommercialOpportunitiesAction } from "@/src/modules/commercial-opportunities/actions";
import { OpportunityCard } from "@/src/modules/commercial-opportunities/components";
import type { CommercialOpportunityFilter } from "@/src/modules/commercial-opportunities/types";

type SearchParams = Promise<{ filter?: string | string[]; page?: string | string[] }>;
const FILTERS: Array<{ value: CommercialOpportunityFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "available", label: "Можно купить сейчас" },
  { value: "arrivals", label: "Поступления" },
  { value: "price", label: "Цена стала ниже" },
  { value: "templates", label: "Шаблоны" },
  { value: "offers", label: "Предложения Novotech" },
];

export default async function OpportunitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filter = normalizeFilter(single(params.filter));
  const page = Math.max(1, Number(single(params.page)) || 1);
  const result = await listCommercialOpportunitiesAction({ filter, page });
  if (!result.success && result.errorCode === "AUTH_REQUIRED") redirect("/auth/sign-in");
  if (!result.success) return <section className="border border-rose-200 bg-rose-50 p-6"><h1 className="font-semibold text-rose-900">Возможности временно недоступны</h1><p className="mt-1 text-sm text-rose-800">Обновите страницу позже. Каталог и корзина продолжают работать.</p></section>;

  return <div className="space-y-6">
    <BehaviorViewEvent dedupeKey={`opportunities:${filter}:${page}`} eventName="opportunities_opened" resultCount={result.data.totalCount} route="/cabinet/opportunities" sourceSurface="opportunity_center" />
    <header className="border-b border-zinc-200 pb-5"><p className="text-xs font-semibold uppercase text-emerald-700">Актуально для вашей компании</p><h1 className="mt-1 text-2xl font-semibold text-zinc-950 sm:text-3xl">Возможности для закупки</h1><p className="mt-2 max-w-3xl text-sm text-zinc-600">Объяснимые сигналы на основе ваших закупок, списков, шаблонов и текущих данных о ценах и наличии.</p></header>
    <nav aria-label="Фильтры возможностей" className="flex max-w-full gap-2 overflow-x-auto pb-1">{FILTERS.map((item) => <Link aria-current={filter === item.value ? "page" : undefined} className={`flex min-h-11 shrink-0 items-center rounded-md border px-3 text-sm font-semibold ${filter === item.value ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-zinc-300 bg-white text-zinc-700"}`} href={filterHref(item.value)} key={item.value} prefetch={false}>{item.label}</Link>)}</nav>
    {result.data.items.length ? <div className="grid gap-4 xl:grid-cols-2">{result.data.items.map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} />)}</div> : <section className="border border-dashed border-zinc-300 bg-white px-6 py-12 text-center"><h2 className="font-semibold text-zinc-950">Сейчас новых возможностей нет</h2><p className="mt-1 text-sm text-zinc-600">Мы покажем здесь релевантные изменения по вашим закупкам, шаблонам и спискам.</p><Link className="mt-4 inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" href="/cabinet/catalog">Открыть каталог</Link></section>}
    <nav className="flex items-center justify-between border-t border-zinc-200 pt-4">{result.data.page > 1 ? <Link className="min-h-11 rounded-md border border-zinc-300 px-4 py-2 text-sm" href={pageHref(filter, result.data.page - 1)} prefetch={false}>Назад</Link> : <span />}<span className="text-sm text-zinc-500">Страница {result.data.page} из {result.data.totalPages}</span>{result.data.page < result.data.totalPages ? <Link className="min-h-11 rounded-md border border-zinc-300 px-4 py-2 text-sm" href={pageHref(filter, result.data.page + 1)} prefetch={false}>Далее</Link> : <span />}</nav>
  </div>;
}

function normalizeFilter(value: string): CommercialOpportunityFilter { return FILTERS.some((item) => item.value === value) ? value as CommercialOpportunityFilter : "all"; }
function single(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function filterHref(filter: CommercialOpportunityFilter): string { return filter === "all" ? "/cabinet/opportunities" : `/cabinet/opportunities?filter=${filter}`; }
function pageHref(filter: CommercialOpportunityFilter, page: number): string { const params = new URLSearchParams(); if (filter !== "all") params.set("filter", filter); if (page > 1) params.set("page", String(page)); return `/cabinet/opportunities?${params}`; }

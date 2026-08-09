import { Search, UsersRound } from "lucide-react";
import Link from "next/link";

import { listFinalCustomersAction } from "@/src/modules/estimates/actions";
import { FinalCustomerDialog } from "@/src/modules/estimates/components/FinalCustomerDialog";
import { FINAL_CUSTOMER_INDUSTRIES, finalCustomerIndustryLabel } from "@/src/modules/estimates/types";
import { NumberedPagination } from "@/src/modules/platform-ui";

type SearchParams = { search?: string; industry?: string; page?: string };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const page = Number.parseInt(query.page ?? "1", 10) || 1;
  const result = await listFinalCustomersAction({ search: query.search, industryCode: query.industry, page });

  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-5"><div><p className="text-xs font-semibold uppercase text-emerald-700">Сметы и КП</p><h1 className="mt-1 text-2xl font-semibold">Мои заказчики</h1><p className="mt-1 text-sm text-zinc-500">Заказчики, используемые в сметах активной компании.</p></div><FinalCustomerDialog label="Добавить заказчика" /></header>
    <form className="grid min-w-0 gap-3 border-b border-zinc-200 pb-5 sm:grid-cols-[minmax(0,1fr)_16rem_auto]">
      <label className="relative min-w-0"><Search aria-hidden="true" className="absolute left-3 top-3.5 size-4 text-zinc-400" /><span className="sr-only">Поиск заказчика</span><input className="min-h-11 w-full min-w-0 rounded-md border border-zinc-300 pl-9 pr-3 text-sm" defaultValue={query.search} name="search" placeholder="Название или IDNO" /></label>
      <label><span className="sr-only">Отрасль</span><select className="min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm" defaultValue={query.industry ?? ""} name="industry"><option value="">Все отрасли</option>{FINAL_CUSTOMER_INDUSTRIES.map((industry) => <option key={industry.code} value={industry.code}>{industry.label}</option>)}</select></label>
      <button className="min-h-11 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white" type="submit">Найти</button>
    </form>
    {!result.success ? <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">{result.message}</p> : result.data.records.length ? <>
      <div className="hidden overflow-x-auto border-y border-zinc-200 bg-white md:block"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Заказчик</th><th className="px-4 py-3">Город / регион</th><th className="px-4 py-3">Отрасль</th><th className="px-4 py-3 text-right">Сметы</th><th className="px-4 py-3">Последняя смета</th><th className="px-4 py-3">Последний проект / объект</th><th className="px-4 py-3">Действия</th></tr></thead><tbody className="divide-y divide-zinc-100">{result.data.records.map((customer) => <tr key={customer.id}><td className="px-4 py-4"><Link className="font-semibold hover:text-emerald-700" href={`/cabinet/customers/${customer.id}`} prefetch={false}>{customer.displayName}</Link><p className="mt-1 text-xs text-zinc-500">{customer.fiscalCode ?? "IDNO не указан"}</p></td><td className="px-4 py-4">{customer.locality ?? "—"}</td><td className="px-4 py-4">{finalCustomerIndustryLabel(customer.industryCode)}</td><td className="px-4 py-4 text-right tabular-nums">{customer.estimateCount}</td><td className="px-4 py-4">{customer.lastEstimateId ? <Link className="font-medium hover:text-emerald-700" href={`/cabinet/estimates/${customer.lastEstimateId}`} prefetch={false}>{customer.lastEstimateNumber}<span className="mt-1 block text-xs font-normal text-zinc-500">{formatDate(customer.lastEstimateAt)}</span></Link> : "—"}</td><td className="max-w-xs px-4 py-4">{customer.lastProjectName ?? "—"}</td><td className="px-4 py-3"><FinalCustomerDialog customer={customer} /></td></tr>)}</tbody></table></div>
      <div className="space-y-3 md:hidden">{result.data.records.map((customer) => <article className="border-y border-zinc-200 bg-white py-4" key={customer.id}><div className="flex items-start justify-between gap-3"><Link className="font-semibold text-zinc-950" href={`/cabinet/customers/${customer.id}`} prefetch={false}>{customer.displayName}</Link><FinalCustomerDialog customer={customer} /></div><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><dt className="text-zinc-500">Город / регион</dt><dd>{customer.locality ?? "—"}</dd><dt className="text-zinc-500">Отрасль</dt><dd>{finalCustomerIndustryLabel(customer.industryCode)}</dd><dt className="text-zinc-500">Количество смет</dt><dd>{customer.estimateCount}</dd><dt className="text-zinc-500">Последний объект</dt><dd>{customer.lastProjectName ?? "—"}</dd></dl></article>)}</div>
      <NumberedPagination ariaLabel="Страницы заказчиков" currentPage={result.data.page} hrefForPage={(target) => customerPageHref(query, target)} totalPages={result.data.totalPages} />
    </> : <section className="border-y border-dashed border-zinc-300 py-14 text-center"><UsersRound className="mx-auto size-8 text-emerald-700" /><h2 className="mt-4 font-semibold">Заказчиков пока нет</h2><p className="mt-1 text-sm text-zinc-500">Добавьте первого заказчика для повторного использования в сметах.</p><div className="mt-5"><FinalCustomerDialog label="Добавить заказчика" /></div></section>}
  </div>;
}

function customerPageHref(query: SearchParams, page: number) { const params = new URLSearchParams(); if (query.search) params.set("search", query.search); if (query.industry) params.set("industry", query.industry); params.set("page", String(page)); return `/cabinet/customers?${params.toString()}`; }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)) : "—"; }

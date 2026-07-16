import { Calculator, FilePlus2, Search } from "lucide-react";
import Link from "next/link";

import { listEstimatesAction } from "@/src/modules/estimates/actions";
import { EstimateStatusBadge, estimateStatusLabels } from "@/src/modules/estimates/components/EstimateStatusBadge";
import type { EstimateStatus } from "@/src/modules/estimates/types";

type SearchParams = { search?: string; status?: string; versionStatus?: string; dateFrom?: string; dateTo?: string; page?: string };

export default async function EstimatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const result = await listEstimatesAction({
    search: query.search,
    status: query.status as EstimateStatus | undefined,
    versionStatus: query.versionStatus as "has_sent" | "accepted" | "rejected" | undefined,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    page: Number(query.page),
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-semibold text-zinc-950">Сметы и КП</h1><p className="mt-1 text-sm text-zinc-500">Коммерческие расчёты и предложения для объектов заказчиков.</p></div>
        <Link className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white" href="/cabinet/estimates/new"><FilePlus2 className="size-4" />Создать смету</Link>
      </header>

      <form className="grid gap-3 border-b border-zinc-200 pb-5 md:grid-cols-[minmax(14rem,1fr)_12rem_12rem_10rem_10rem_auto]">
        <label className="relative"><Search aria-hidden="true" className="absolute left-3 top-3 size-4 text-zinc-400" /><span className="sr-only">Поиск</span><input className="h-10 w-full rounded-md border border-zinc-300 pl-9 pr-3 text-sm" defaultValue={query.search} name="search" placeholder="Номер, название, заказчик, объект" /></label>
        <label><span className="sr-only">Статус</span><select className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm" defaultValue={query.status ?? ""} name="status"><option value="">Все статусы</option>{Object.entries(estimateStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span className="sr-only">Статус версии</span><select className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm" defaultValue={query.versionStatus ?? ""} name="versionStatus"><option value="">Все версии</option><option value="has_sent">Есть отправленная версия</option><option value="accepted">Принято</option><option value="rejected">Отклонено</option></select></label>
        <label><span className="sr-only">Дата с</span><input className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm" defaultValue={query.dateFrom} name="dateFrom" type="date" /></label>
        <label><span className="sr-only">Дата по</span><input className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm" defaultValue={query.dateTo} name="dateTo" type="date" /></label>
        <button className="h-10 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold" type="submit">Применить</button>
      </form>

      {!result.success ? (
        <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">{result.message}</p>
      ) : result.data.records.length ? (
        <>
          <div className="overflow-x-auto border-y border-zinc-200 bg-white">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Смета</th><th className="px-4 py-3">Заказчик / объект</th><th className="px-4 py-3">Статус</th><th className="px-4 py-3 text-right">Итого</th><th className="px-4 py-3">Обновлена</th><th className="px-4 py-3">Версии</th><th className="px-4 py-3">Автор</th></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {result.data.records.map((estimate) => (
                  <tr className="hover:bg-zinc-50" key={estimate.id}>
                    <td className="px-4 py-4"><Link className="font-semibold text-zinc-950 hover:text-emerald-700" href={`/cabinet/estimates/${estimate.id}`}>{estimate.estimateNumber}</Link><p className="mt-1 max-w-xs truncate text-xs text-zinc-500">{estimate.name}</p></td>
                    <td className="px-4 py-4 text-zinc-600">{estimate.customerProject}<p className="mt-1 text-xs text-zinc-400">{estimate.itemCount} позиций</p></td>
                    <td className="px-4 py-4"><EstimateStatusBadge status={estimate.status} /></td>
                    <td className="px-4 py-4 text-right font-semibold">{estimate.total}</td>
                    <td className="px-4 py-4 text-zinc-600">{formatDate(estimate.updatedAt)}</td>
                    <td className="px-4 py-4"><span className="font-semibold">{estimate.versionCount}</span>{estimate.latestVersionStatus && <p className="mt-1 text-xs text-zinc-500">Последняя: {versionLabel(estimate.latestVersionStatus)}</p>}{estimate.hasAcceptedVersion && <p className="mt-1 text-xs font-semibold text-emerald-700">Есть принятая версия</p>}</td>
                    <td className="px-4 py-4 text-zinc-600">{estimate.createdByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination current={result.data.page} query={query} total={result.data.totalPages} />
        </>
      ) : (
        <section className="border-y border-dashed border-zinc-300 bg-white px-6 py-14 text-center"><Calculator className="mx-auto size-8 text-emerald-700" /><h2 className="mt-4 font-semibold">Смет пока нет</h2><p className="mt-1 text-sm text-zinc-500">Создайте первый коммерческий расчёт без Excel.</p><Link className="mt-5 inline-flex rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white" href="/cabinet/estimates/new">Создать смету</Link></section>
      )}
    </div>
  );
}

function Pagination({ current, query, total }: { current: number; query: SearchParams; total: number }) {
  if (total <= 1) return null;
  const href = (page: number) => {
    const params = new URLSearchParams();
    for (const key of ["search", "status", "versionStatus", "dateFrom", "dateTo"] as const) if (query[key]) params.set(key, query[key]!);
    params.set("page", String(page));
    return `/cabinet/estimates?${params.toString()}`;
  };
  return <nav aria-label="Страницы смет" className="flex items-center justify-between text-sm"><Link aria-disabled={current <= 1} className={`font-semibold ${current <= 1 ? "pointer-events-none text-zinc-300" : "text-emerald-700"}`} href={href(current - 1)}>← Назад</Link><span className="text-zinc-500">Страница {current} из {total}</span><Link aria-disabled={current >= total} className={`font-semibold ${current >= total ? "pointer-events-none text-zinc-300" : "text-emerald-700"}`} href={href(current + 1)}>Далее →</Link></nav>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function versionLabel(value: import("@/src/modules/estimates/types").EstimateVersionStatus) { return ({ prepared: "Подготовлено", sent: "Отправлено", accepted: "Принято", rejected: "Отклонено", archived: "Архив" } as const)[value]; }

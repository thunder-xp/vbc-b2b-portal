import Link from "next/link";

import { UnifiedServiceHistoryList, listUnifiedServiceHistoryAction } from "@/src/modules/service-history";
import { PartnerWarrantySerialLookup } from "@/src/modules/warranty-serials";

export default async function ServicePage({ searchParams }: { searchParams: Promise<{ query?: string; filter?: string; page?: string }> }) {
  const params = await searchParams;
  const result = await listUnifiedServiceHistoryAction(params);
  return <div className="mx-auto max-w-6xl space-y-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="text-xs font-semibold uppercase text-emerald-700">Сервис Novotech</p><h1 className="mt-1 text-2xl font-semibold">Сервис и гарантия</h1><p className="mt-2 text-sm text-zinc-600">Проверка гарантии, регистрация обращений и история обслуживания оборудования.</p></div>
      <Link className="inline-flex min-h-11 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" href="/cabinet/service/new">Создать заявку</Link>
    </header>
    <section aria-labelledby="warranty-check-title"><h2 className="mb-3 text-lg font-semibold" id="warranty-check-title">Проверка покупки и гарантии</h2><PartnerWarrantySerialLookup /></section>
    <section aria-labelledby="service-history-title" className="space-y-4">
      <div><h2 className="text-xl font-semibold" id="service-history-title">История сервисного обслуживания</h2><p className="mt-1 text-sm text-zinc-600">Заявки из кабинета и подтверждённые сервисные документы Novotech.</p></div>
      <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
        <input className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm" defaultValue={params.query} name="query" placeholder="Номер, товар или серийный номер" />
        <select aria-label="Фильтр истории" className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm" defaultValue={params.filter ?? "all"} name="filter">
          <option value="active">Активные</option><option value="ready">Готово к выдаче</option><option value="completed">Завершённые</option><option value="all">Все</option>
        </select>
        <button className="min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold">Найти</button>
      </form>
      {result.success ? <UnifiedServiceHistoryList filter={params.filter} page={result.data} query={params.query} /> : <p className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Не удалось загрузить историю. Повторите попытку позже.</p>}
    </section>
  </div>;
}

import Link from "next/link";

import { listSupportTicketsAction, SupportTicketList } from "@/src/modules/partner-support";

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ query?: string; filter?: string; page?: string }> }) {
  const params = await searchParams;
  const result = await listSupportTicketsAction(params);

  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="text-xs font-semibold uppercase text-emerald-700">Помощь Novotech</p><h1 className="mt-1 text-2xl font-semibold">IT-поддержка</h1><p className="mt-2 text-sm text-zinc-600">Помощь с доступом и работой в партнёрской платформе.</p></div>
      <Link className="inline-flex min-h-11 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" href="/cabinet/support/new">Новая заявка</Link>
    </header>
    <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
      <input className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm" defaultValue={params.query} name="query" placeholder="Номер или описание" />
      <select className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm" defaultValue={params.filter ?? "active"} name="filter"><option value="active">Активные</option><option value="waiting">Ожидают ответа</option><option value="closed">Решённые и закрытые</option><option value="all">Все</option></select>
      <button className="min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold">Найти</button>
    </form>
    {result.success ? <SupportTicketList page={result.data} /> : <p className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Не удалось загрузить заявки. Повторите попытку позже.</p>}
  </div>;
}

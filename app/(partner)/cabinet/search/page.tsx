import { Search } from "lucide-react";

import { PartnerSearchResults, searchPartnerWorkspaceAction } from "@/src/modules/partner-search";
import { normalizeSearchQuery } from "@/src/modules/partner-search/services/partner-search.service";

export default async function PartnerSearchPage({ searchParams }: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = normalizeSearchQuery(Array.isArray(params.q) ? params.q[0] ?? "" : params.q ?? "");
  const result = query.length >= 2 ? await searchPartnerWorkspaceAction(query) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="border-b border-zinc-200 pb-4">
        <h1 className="text-2xl font-semibold text-zinc-950">Поиск</h1>
        <p className="mt-1 text-sm text-zinc-600">Товары, списки закупок, сметы, документы и сервисные заявки.</p>
      </header>
      <form action="/cabinet/search" className="flex gap-2" role="search">
        <label className="sr-only" htmlFor="workspace-search-page-input">Поиск по рабочему пространству</label>
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden="true" className="absolute left-3 top-3.5 size-4 text-zinc-400" />
          <input autoFocus className="h-11 w-full rounded-md border border-zinc-300 bg-white pl-9 pr-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100" defaultValue={query} id="workspace-search-page-input" name="q" placeholder="Название, номер или SKU" type="search" />
        </div>
        <button className="min-h-11 rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white" type="submit">Найти</button>
      </form>
      {query.length < 2 ? <p className="border border-zinc-200 bg-white p-5 text-sm text-zinc-600">Введите не менее двух символов.</p> : result?.success ? <PartnerSearchResults groups={result.data} query={query} /> : <p className="border border-red-200 bg-red-50 p-5 text-sm text-red-800">Поиск временно недоступен. Повторите попытку.</p>}
    </div>
  );
}

import { ArrowRight, Layers3, Star } from "lucide-react";
import Link from "next/link";

import { listPurchasingListsAction } from "@/src/modules/purchasing-lists/actions";
import { NumberedPagination } from "@/src/modules/platform-ui";
import { formatPartnerDate, getSavedKitCopy, procurementCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

type Params = {
  search?: string;
  filter?: "all" | "private" | "company" | "mine" | "archived" | "favorites";
  page?: string;
};

export default async function PurchasingListsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [query, locale] = await Promise.all([searchParams, getPartnerLocale()]);
  const copy = procurementCopy(locale);
  const kitCopy = getSavedKitCopy(locale);
  const favoritesView = query.filter === "favorites";
  const actionFilter = query.filter === "favorites" ? "all" : query.filter;
  const result = await listPurchasingListsAction({ search: query.search, filter: actionFilter, page: Number(query.page) || 1 });
  if (!result.success) return <p className="rounded-md border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{copy.unavailable}</p>;

  const page = result.data;
  const records = page.records.filter((record) => favoritesView ? record.isSystemFavorites : !record.isSystemFavorites);
  const Icon = favoritesView ? Star : Layers3;

  return <div className="mx-auto max-w-7xl space-y-5">
    <header className={favoritesView ? "pb-5" : "border-b border-zinc-200 pb-5"}>
      <p className="text-xs font-semibold uppercase text-emerald-700">{copy.selection}</p>
      <h1 className="mt-1 text-2xl font-semibold">{favoritesView ? copy.favorites : kitCopy.title}</h1>
      {favoritesView ? <p className="mt-1 text-sm text-zinc-500">{copy.favoritesHint}</p> : null}
    </header>

    {!favoritesView ? <form className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_180px_auto]">
      <input className="h-10 rounded-md border border-zinc-300 px-3 text-sm" defaultValue={query.search ?? ""} name="search" placeholder={copy.searchNameDescription} />
      <select className="h-10 rounded-md border border-zinc-300 px-3 text-sm" defaultValue={query.filter ?? "all"} name="filter">
        <option value="all">{copy.all}</option>
        <option value="private">{copy.privatePlural}</option>
        <option value="company">{copy.company}</option>
        <option value="mine">{copy.mine}</option>
        <option value="archived">{copy.archive}</option>
      </select>
      <button className="min-h-11 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white">{copy.apply}</button>
    </form> : null}

    {records.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {records.map((list) => <article className="flex min-w-0 flex-col rounded-lg border border-zinc-200 bg-white p-4" key={list.id}>
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-800"><Icon aria-hidden="true" className="size-5" /></span>
          <div className="min-w-0"><h2 className="truncate font-semibold text-zinc-950">{list.name}</h2><p className="mt-1 text-sm text-zinc-600"><strong>{list.itemCount}</strong> {kitCopy.products} · <strong>{list.totalQuantity}</strong> {kitCopy.units}</p><p className="mt-1 text-xs text-zinc-500">{kitCopy.modified}: {formatPartnerDate(list.updatedAt, locale)}</p></div>
        </div>
        <Link className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" href={`/cabinet/purchasing-lists/${list.id}`}>
          <ArrowRight aria-hidden="true" className="size-4" />{kitCopy.open}
        </Link>
      </article>)}
    </div> : <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-600">{favoritesView ? copy.favoritesEmpty : kitCopy.empty}</p>}

    {!favoritesView ? <NumberedPagination ariaLabel={copy.pages} currentPage={page.page} hrefForPage={(targetPage) => pageHref(targetPage, query)} locale={locale} totalPages={page.totalPages} /> : null}
  </div>;
}

function pageHref(page: number, query: Params) {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.filter && query.filter !== "favorites") params.set("filter", query.filter);
  params.set("page", String(page));
  return `/cabinet/purchasing-lists?${params}`;
}

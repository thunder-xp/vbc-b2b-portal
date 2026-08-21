import { Archive, ListPlus } from "lucide-react";
import Link from "next/link";

import { listPurchasingListsAction } from "@/src/modules/purchasing-lists/actions";
import {
  PurchasingListActions,
  SaveAsPurchasingListButton,
} from "@/src/modules/purchasing-lists/components";
import { NumberedPagination } from "@/src/modules/platform-ui";
import {
  formatPartnerDate,
  procurementCopy,
} from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

type Params = {
  search?: string;
  filter?: "all" | "private" | "company" | "mine" | "archived";
  page?: string;
};
export default async function PurchasingListsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const [query, locale] = await Promise.all([searchParams, getPartnerLocale()]);
  const copy = procurementCopy(locale);
  const result = await listPurchasingListsAction({
    search: query.search,
    filter: query.filter,
    page: Number(query.page) || 1,
  });
  if (!result.success)
    return (
      <p className="rounded-md border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
        {copy.unavailable}
      </p>
    );
  const page = result.data;
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-col gap-3 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">
            {copy.selection}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{copy.favorites}</h1>
          <p className="mt-1 text-sm text-zinc-500">{copy.favoritesHint}</p>
        </div>
        <Link
          className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
          href="/cabinet/purchasing-lists/new"
        >
          <ListPlus className="size-4" />
          {copy.createList}
        </Link>
      </header>
      <form className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_180px_auto]">
        <input
          className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
          defaultValue={query.search ?? ""}
          name="search"
          placeholder={copy.searchNameDescription}
        />
        <select
          className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
          defaultValue={query.filter ?? "all"}
          name="filter"
        >
          <option value="all">{copy.all}</option>
          <option value="private">{copy.privatePlural}</option>
          <option value="company">{copy.company}</option>
          <option value="mine">{copy.mine}</option>
          <option value="archived">{copy.archive}</option>
        </select>
        <button className="rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white">
          {copy.apply}
        </button>
      </form>
      {page.records.length ? (
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <div className="hidden grid-cols-[minmax(220px,1fr)_120px_120px_150px_210px] gap-4 border-b bg-zinc-50 px-4 py-3 text-xs font-semibold uppercase text-zinc-500 md:grid">
            <span>{copy.list}</span>
            <span>{copy.positions}</span>
            <span>{copy.warnings}</span>
            <span>{copy.updated}</span>
            <span>{copy.actions}</span>
          </div>
          {page.records.map((list) => (
            <article
              className="grid gap-3 border-b border-zinc-100 px-4 py-4 last:border-0 md:grid-cols-[minmax(220px,1fr)_120px_120px_150px_210px] md:items-center"
              key={list.id}
            >
              <div className="min-w-0">
                <Link
                  className="font-semibold hover:text-emerald-700"
                  href={`/cabinet/purchasing-lists/${list.id}`}
                >
                  {list.name}
                </Link>
                <p className="truncate text-sm text-zinc-500">
                  {list.description || copy.noDescription}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  {list.visibility === "private" ? copy.private : copy.company}{" "}
                  · {list.ownerName}
                </p>
              </div>
              <p className="text-sm">
                <strong>{list.itemCount}</strong>{" "}
                {copy.positions.toLocaleLowerCase(
                  locale === "ro" ? "ro" : "ru",
                )}
                <br />
                <span className="text-xs text-zinc-500">
                  {list.totalQuantity} {copy.units}
                </span>
              </p>
              <p
                className={
                  list.warningCount
                    ? "text-sm font-semibold text-amber-700"
                    : "text-sm text-emerald-700"
                }
              >
                {list.warningCount}
              </p>
              <time className="text-sm text-zinc-500">
                {formatPartnerDate(list.updatedAt, locale)}
              </time>
              <PurchasingListActions
                archived={Boolean(list.archivedAt)}
                canManage={list.canManage}
                listId={list.id}
                name={list.name}
                revision={list.revision}
              />
            </article>
          ))}
        </div>
      ) : (
        <section className="border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
          <Archive className="mx-auto size-8 text-emerald-700" />
          <h2 className="mt-4 font-semibold">{copy.favoritesEmpty}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {copy.favoritesEmptyHint}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
              href="/cabinet/purchasing-lists/new"
            >
              {copy.createList}
            </Link>
            <SaveAsPurchasingListButton
              source="cart"
              label={copy.saveCurrentCart}
            />
          </div>
        </section>
      )}
      <NumberedPagination
        ariaLabel={copy.pages}
        currentPage={page.page}
        hrefForPage={(targetPage) => pageHref(targetPage, query)}
        locale={locale}
        totalPages={page.totalPages}
      />
    </div>
  );
}
function pageHref(page: number, query: Params) {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.filter) params.set("filter", query.filter);
  params.set("page", String(page));
  return `/cabinet/purchasing-lists?${params}`;
}

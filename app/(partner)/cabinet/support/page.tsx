import Link from "next/link";

import {
  listSupportTicketsAction,
  SupportTicketList,
} from "@/src/modules/partner-support";
import { supportCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; filter?: string; page?: string }>;
}) {
  const [params, locale] = await Promise.all([
    searchParams,
    getPartnerLocale(),
  ]);
  const copy = supportCopy(locale);
  const result = await listSupportTicketsAction(params);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">
            {copy.eyebrow}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{copy.title}</h1>
          <p className="mt-2 text-sm text-zinc-600">{copy.description}</p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white"
          href="/cabinet/support/new"
        >
          {copy.create}
        </Link>
      </header>
      <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
        <input
          className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm"
          defaultValue={params.query}
          name="query"
          placeholder={copy.searchPlaceholder}
        />
        <select
          className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm"
          defaultValue={params.filter ?? "active"}
          name="filter"
        >
          <option value="active">{copy.active}</option>
          <option value="waiting">{copy.waiting}</option>
          <option value="closed">{copy.closed}</option>
          <option value="all">{copy.all}</option>
        </select>
        <button className="min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold">
          {copy.search}
        </button>
      </form>
      {result.success ? (
        <SupportTicketList locale={locale} page={result.data} />
      ) : (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {copy.loadError}
        </p>
      )}
    </div>
  );
}

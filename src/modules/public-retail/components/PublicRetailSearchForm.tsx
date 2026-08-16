import { Search } from "lucide-react";

import { retailCopy } from "../presentation";
import type { PublicRetailLocale } from "../types";

export function PublicRetailSearchForm({ locale, prominent = false, defaultValue, id = "header" }: { locale: PublicRetailLocale; prominent?: boolean; defaultValue?: string; id?: string }) {
  const copy = retailCopy[locale];

  return <form action="/catalog" className={`flex min-w-0 flex-1 bg-white ${prominent ? "border-2 border-blue-700" : "border border-zinc-300"}`} method="get" role="search">
    <input name="lang" type="hidden" value={locale} />
    <input name="view" type="hidden" value="all" />
    <label className="sr-only" htmlFor={`public-retail-search-${id}`}>{copy.search}</label>
    <Search aria-hidden="true" className="ml-3 size-5 shrink-0 self-center text-zinc-500" />
    <input
      autoComplete="off"
      className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-sm text-zinc-950 outline-none placeholder:text-zinc-500"
      defaultValue={defaultValue}
      id={`public-retail-search-${id}`}
      name="q"
      placeholder={copy.search}
      type="search"
    />
    <button className="public-primary-action min-h-11 shrink-0 px-4 text-sm font-semibold sm:px-5" type="submit">{copy.searchAction}</button>
  </form>;
}

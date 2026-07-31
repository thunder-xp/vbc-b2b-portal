import { Calculator, FileText, ListPlus, ListRestart, PackageSearch, Rows3, SearchX } from "lucide-react";
import Link from "next/link";

import type { PartnerSearchDocumentType, PartnerSearchGroup } from "../types";

const ICONS: Record<PartnerSearchDocumentType, typeof PackageSearch> = {
  product: PackageSearch,
  purchasing_list: ListPlus,
  estimate: Calculator,
  proposal: FileText,
  manual_line: Rows3,
  template: FileText,
  purchase_template: ListRestart,
};

export function PartnerSearchResults({ groups, query }: { groups: PartnerSearchGroup[]; query: string }) {
  if (!groups.length) {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center border border-zinc-200 bg-white p-6 text-center">
        <SearchX aria-hidden="true" className="size-8 text-zinc-400" />
        <h2 className="mt-3 font-semibold text-zinc-950">Ничего не найдено</h2>
        <p className="mt-1 text-sm text-zinc-600">Уточните название, номер или SKU.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const Icon = ICONS[group.type];
        return (
          <section aria-labelledby={`search-${group.type}`} key={group.type}>
            <div className="mb-2 flex items-center gap-2">
              <Icon aria-hidden="true" className="size-4 text-emerald-700" />
              <h2 className="text-sm font-semibold text-zinc-950" id={`search-${group.type}`}>{group.label}</h2>
              <span className="text-xs text-zinc-500">{group.results.length}</span>
            </div>
            <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">
              {group.results.map((result) => (
                <li key={`${result.documentType}:${result.documentId}`}>
                  <Link className="block min-h-16 px-4 py-3 outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600" href={result.route} prefetch={false}>
                    <span className="block font-medium text-zinc-950">{result.title}</span>
                    {result.subtitle ? <span className="mt-1 block text-xs text-zinc-500">{result.subtitle}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="sr-only">Результаты поиска по запросу {query}</p>
    </div>
  );
}

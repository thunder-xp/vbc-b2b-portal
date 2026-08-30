import { Check } from "lucide-react";

import {
  CATALOG_SORT_OPTIONS,
  type CatalogSort,
  type CatalogSortHiddenField,
} from "../services";
import {
  getCatalogCopy,
  type PartnerLocale,
} from "../../partner-locale";

export function CatalogSortControl({
  hiddenFields,
  locale = "ru",
  sort,
}: {
  hiddenFields: CatalogSortHiddenField[];
  locale?: PartnerLocale;
  sort: CatalogSort;
}) {
  const copy = getCatalogCopy(locale);

  return (
    <form
      action="/cabinet/catalog"
      className="flex w-full min-w-0 gap-2 sm:w-auto"
      data-testid="catalog-toolbar-sort"
    >
      {hiddenFields.map((field) => (
        <input
          key={field.name}
          name={field.name}
          type="hidden"
          value={field.value}
        />
      ))}
      <label className="min-w-0 flex-1">
        <span className="sr-only">{copy.sort}</span>
        <select
          aria-label={copy.sort}
          className="h-11 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 sm:w-48"
          defaultValue={sort}
          name="sort"
        >
          {CATALOG_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {sortLabel(option.value, copy)}
            </option>
          ))}
        </select>
      </label>
      <button
        aria-label={copy.apply}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 hover:border-emerald-600 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
        title={copy.apply}
        type="submit"
      >
        <Check aria-hidden="true" className="size-4" />
      </button>
    </form>
  );
}

type CatalogCopy = ReturnType<typeof getCatalogCopy>;

function sortLabel(sort: CatalogSort, copy: CatalogCopy): string {
  const labels: Record<CatalogSort, string> = {
    default: copy.sortDefault,
    availability_asc: copy.sortAvailabilityAsc,
    availability_desc: copy.sortAvailabilityDesc,
    price_asc: copy.sortPriceAsc,
    price_desc: copy.sortPriceDesc,
    markup_asc: copy.sortMarkupAsc,
    markup_desc: copy.sortMarkupDesc,
  };
  return labels[sort];
}

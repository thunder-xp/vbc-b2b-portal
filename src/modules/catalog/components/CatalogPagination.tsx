import Link from "next/link";

import type { MerchandisingLabelCode } from "../../merchandising/types";
import {
  buildCatalogHref,
  buildCatalogPaginationItems,
  getCatalogTotalPages,
  type CatalogSort,
} from "../services";
import type { CatalogAvailability } from "./CatalogFilters";

type CatalogPaginationProps = {
  availability: CatalogAvailability;
  attributeFilters: Record<string, string[]>;
  brandId?: string;
  categoryId?: string;
  explicitAll: boolean;
  merchandisingLabel?: MerchandisingLabelCode;
  page: number;
  pageSize: number;
  search?: string;
  sort: CatalogSort;
  totalCount: number;
};

const LINK_CLASS_NAME = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none hover:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500";
const DISABLED_CLASS_NAME = "inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 px-3 text-sm font-semibold text-zinc-400";

export function CatalogPagination({ availability, attributeFilters, brandId, categoryId, explicitAll, merchandisingLabel, page, pageSize, search, sort, totalCount }: CatalogPaginationProps) {
  const totalPages = getCatalogTotalPages(totalCount, pageSize);
  if (totalPages <= 1) return null;
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const hrefForPage = (targetPage: number) => buildCatalogHref({ availability, attributeFilters, brandId, categoryId, explicitAll, merchandisingLabel, page: targetPage, search, sort });

  return <nav aria-label="Пагинация каталога" className="flex flex-wrap items-center justify-center gap-1.5 border-t border-zinc-200 pt-5">
    {currentPage > 1 ? <Link aria-label="Предыдущая страница" className={LINK_CLASS_NAME} href={hrefForPage(currentPage - 1)} prefetch={false}>Назад</Link> : <span aria-disabled="true" className={DISABLED_CLASS_NAME}>Назад</span>}
    {buildCatalogPaginationItems(currentPage, totalPages).map((item, index) => item === "ellipsis"
      ? <span aria-hidden="true" className="inline-flex min-h-11 min-w-8 items-center justify-center text-zinc-500" key={`ellipsis-${index}`}>…</span>
      : item === currentPage
        ? <span aria-current="page" aria-label={`Страница ${item}, текущая`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-emerald-700 bg-emerald-700 px-3 text-sm font-semibold text-white" key={item}>{item}</span>
        : <Link aria-label={`Страница ${item}`} className={LINK_CLASS_NAME} href={hrefForPage(item)} key={item} prefetch={false}>{item}</Link>)}
    {currentPage < totalPages ? <Link aria-label="Следующая страница" className={LINK_CLASS_NAME} href={hrefForPage(currentPage + 1)} prefetch={false}>Далее</Link> : <span aria-disabled="true" className={DISABLED_CLASS_NAME}>Далее</span>}
  </nav>;
}

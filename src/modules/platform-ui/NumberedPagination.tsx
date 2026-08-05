import Link from "next/link";

import { buildPaginationItems } from "./pagination";

const linkClassName = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none hover:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500";
const disabledClassName = "inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 px-3 text-sm font-semibold text-zinc-400";

export function NumberedPagination({
  ariaLabel,
  currentPage,
  hrefForPage,
  totalPages,
}: {
  ariaLabel: string;
  currentPage: number;
  hrefForPage: (page: number) => string;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const current = Math.min(Math.max(1, currentPage), totalPages);

  return (
    <nav aria-label={ariaLabel} className="flex flex-wrap items-center justify-center gap-1.5 border-t border-zinc-200 pt-5">
      {current > 1 ? <Link aria-label="Предыдущая страница" className={linkClassName} href={hrefForPage(current - 1)} prefetch={false}>Назад</Link> : <span aria-disabled="true" className={disabledClassName}>Назад</span>}
      {buildPaginationItems(current, totalPages).map((item, index) => item === "ellipsis"
        ? <span aria-hidden="true" className="inline-flex min-h-11 min-w-8 items-center justify-center text-zinc-500" key={`ellipsis-${index}`}>…</span>
        : item === current
          ? <span aria-current="page" aria-label={`Страница ${item}, текущая`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-emerald-700 bg-emerald-700 px-3 text-sm font-semibold text-white" key={item}>{item}</span>
          : <Link aria-label={`Страница ${item}`} className={linkClassName} href={hrefForPage(item)} key={item} prefetch={false}>{item}</Link>)}
      {current < totalPages ? <Link aria-label="Следующая страница" className={linkClassName} href={hrefForPage(current + 1)} prefetch={false}>Далее</Link> : <span aria-disabled="true" className={disabledClassName}>Далее</span>}
    </nav>
  );
}

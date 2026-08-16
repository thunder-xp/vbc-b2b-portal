import Link from "next/link";

import { buildPaginationItems } from "./pagination";

const disabledClassName = "inline-flex min-h-11 items-center justify-center border border-zinc-200 bg-zinc-100 px-3 text-sm font-semibold text-zinc-400";

export function NumberedPagination({
  ariaLabel,
  currentPage,
  hrefForPage,
  nextAriaLabel = "Следующая страница",
  nextLabel = "Далее",
  previousAriaLabel = "Предыдущая страница",
  previousLabel = "Назад",
  square = false,
  tone = "default",
  totalPages,
}: {
  ariaLabel: string;
  currentPage: number;
  hrefForPage: (page: number) => string;
  nextAriaLabel?: string;
  nextLabel?: string;
  previousAriaLabel?: string;
  previousLabel?: string;
  square?: boolean;
  tone?: "default" | "retail";
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const current = Math.min(Math.max(1, currentPage), totalPages);
  const linkClassName = `inline-flex min-h-11 min-w-11 items-center justify-center border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus-visible:ring-2 ${tone === "retail" ? "hover:border-blue-600 focus-visible:ring-blue-600" : "hover:border-emerald-500 focus-visible:ring-emerald-500"}`;

  return (
    <nav aria-label={ariaLabel} className="flex flex-wrap items-center justify-center gap-1.5 border-t border-zinc-200 pt-5">
      {current > 1 ? <Link aria-label={previousAriaLabel} className={`${linkClassName} ${square ? "" : "rounded-md"}`} href={hrefForPage(current - 1)} prefetch={false}>{previousLabel}</Link> : <span aria-disabled="true" className={`${disabledClassName} ${square ? "" : "rounded-md"}`}>{previousLabel}</span>}
      {buildPaginationItems(current, totalPages).map((item, index) => item === "ellipsis"
        ? <span aria-hidden="true" className="inline-flex min-h-11 min-w-8 items-center justify-center text-zinc-500" key={`ellipsis-${index}`}>…</span>
        : item === current
          ? <span aria-current="page" aria-label={`Страница ${item}, текущая`} className={`inline-flex min-h-11 min-w-11 items-center justify-center border px-3 text-sm font-semibold text-white ${tone === "retail" ? "border-blue-700 bg-blue-700" : "border-emerald-700 bg-emerald-700"} ${square ? "" : "rounded-md"}`} key={item}>{item}</span>
          : <Link aria-label={`Страница ${item}`} className={`${linkClassName} ${square ? "" : "rounded-md"}`} href={hrefForPage(item)} key={item} prefetch={false}>{item}</Link>)}
      {current < totalPages ? <Link aria-label={nextAriaLabel} className={`${linkClassName} ${square ? "" : "rounded-md"}`} href={hrefForPage(current + 1)} prefetch={false}>{nextLabel}</Link> : <span aria-disabled="true" className={`${disabledClassName} ${square ? "" : "rounded-md"}`}>{nextLabel}</span>}
    </nav>
  );
}

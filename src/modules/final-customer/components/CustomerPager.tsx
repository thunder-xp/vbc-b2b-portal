import Link from "next/link";

export function CustomerPager({ page, hasNext, path, ro }: { page: number; hasNext: boolean; path: string; ro: boolean }) {
  if (page === 1 && !hasNext) return null;
  return <nav aria-label={ro ? "Paginare" : "Страницы"} className="flex items-center justify-between gap-3"><span className="text-sm text-zinc-500">{ro ? "Pagina" : "Страница"} {page}</span><div className="flex gap-2">{page > 1 ? <Link className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 text-sm font-semibold" href={`${path}?page=${page - 1}`}>{ro ? "Înapoi" : "Назад"}</Link> : null}{hasNext ? <Link className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 text-sm font-semibold" href={`${path}?page=${page + 1}`}>{ro ? "Înainte" : "Далее"}</Link> : null}</div></nav>;
}

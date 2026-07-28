"use client";

import Link from "next/link";

export default function CatalogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center">
      <h2 className="text-lg font-semibold text-zinc-950">Каталог временно недоступен</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-600">
        Не удалось загрузить каталог. Обновите страницу или попробуйте немного позже.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <button className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800" onClick={reset} type="button">
          Повторить
        </button>
        <Link className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:border-emerald-600" href="/cabinet/catalog?view=all">
          Весь каталог
        </Link>
      </div>
      {error.digest ? <p className="mt-4 text-xs text-zinc-400">Код обращения: {error.digest}</p> : null}
    </section>
  );
}

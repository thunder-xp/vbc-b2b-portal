import Link from "next/link";

import type { FinalCustomerLocale } from "../locale";

export function CustomerEmptyState({
  locale,
  title,
  body,
  showService = true,
}: {
  locale: FinalCustomerLocale;
  title: string;
  body: string;
  showService?: boolean;
}) {
  const ro = locale === "ro";
  return (
    <section className="rounded-xl border border-dashed border-zinc-300 bg-white px-5 py-8 text-center">
      <h2 className="font-semibold text-zinc-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-600">{body}</p>
      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
        <Link className="inline-flex min-h-11 items-center justify-center rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white" href={`/catalog?lang=${locale}&view=all`}>
          {ro ? "Deschide catalogul" : "Открыть каталог"}
        </Link>
        {showService ? (
          <Link className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-semibold text-zinc-800" href="/account/service/new">
            {ro ? "Contactați service-ul" : "Обратиться в сервис"}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { hasMaibReviewSession } from "@/src/modules/public-retail/retail-checkout-server";

import { authorizeMaibReviewAction } from "./actions";

export const metadata: Metadata = { title: "MAIB Review | Novotech", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function MaibReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const locale = query.lang === "ro" ? "ro" : "ru";
  if (await hasMaibReviewSession()) redirect(`/catalog?lang=${locale}`);
  const error = typeof query.error === "string" ? query.error : null;
  const ru = locale === "ru";

  return <PublicRetailShell languagePath="/maib-review" locale={locale}>
    <main className="min-h-[calc(100vh-4rem)] bg-zinc-50 px-4 py-12 sm:px-6" lang={locale}>
      <section className="mx-auto max-w-md border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">MAIB Review</p>
        <h1 className="mt-2 text-2xl font-semibold">{ru ? "Проверка оформления заказа" : "Verificarea procesului de comandă"}</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">{ru
          ? "Введите временный код доступа, предоставленный Novotech. Доступ действует четыре часа и открывает только тестовый MAIB Checkout."
          : "Introduceți codul temporar furnizat de Novotech. Accesul este valabil patru ore și deschide numai MAIB Checkout de test."}</p>
        {error ? <p className="mt-4 border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-900" role="alert">{error === "unavailable"
          ? (ru ? "Тестовый MAIB Checkout сейчас недоступен." : "MAIB Checkout de test nu este disponibil momentan.")
          : (ru ? "Неверный или устаревший код доступа." : "Codul de acces este incorect sau expirat.")}</p> : null}
        <form action={authorizeMaibReviewAction} className="mt-6 grid gap-4">
          <input name="locale" type="hidden" value={locale} />
          <label className="text-sm font-medium text-zinc-700">{ru ? "Код доступа" : "Cod acces"}
            <input autoComplete="off" className="mt-1 min-h-12 w-full border border-zinc-300 px-3 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100" maxLength={200} name="accessCode" required type="password" />
          </label>
          <button className="min-h-12 bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800" type="submit">{ru ? "Открыть сайт" : "Deschide site-ul"}</button>
        </form>
        <Link className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-blue-700" href={`/?lang=${locale}`}>{ru ? "Вернуться на сайт" : "Înapoi la site"}</Link>
      </section>
    </main>
  </PublicRetailShell>;
}

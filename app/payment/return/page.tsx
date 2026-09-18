import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { paymentReturnCookieName } from "@/src/modules/payments/payment-return-access";
import { getRetailPaymentReturnState } from "@/src/modules/payments/server";
import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { formatRetailPrice, publicRetailLocale } from "@/src/modules/public-retail/presentation";

export const metadata: Metadata = { title: "Payment status | Novotech", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Query = Promise<Record<string, string | string[] | undefined>>;

export default async function PaymentReturnPage({ searchParams }: { searchParams: Query }) {
  const query = await searchParams;
  const paymentAttemptId = typeof query.paymentAttemptId === "string" ? query.paymentAttemptId : "";
  const cookieName = paymentReturnCookieName(paymentAttemptId);
  const returnToken = cookieName ? (await cookies()).get(cookieName)?.value ?? "" : "";
  const state = paymentAttemptId && returnToken ? await getRetailPaymentReturnState(paymentAttemptId, returnToken).catch(() => null) : null;
  const locale = state?.locale ?? publicRetailLocale(query.lang);
  const status = state?.status ?? "PROCESSING";
  const copy = paymentCopy(status, locale);
  return <PublicRetailShell languagePath="/payment/return" locale={locale}><main className="grid min-h-[70vh] place-items-center bg-zinc-50 px-4 py-10">
    <section className="w-full max-w-2xl border border-zinc-200 bg-white p-6 sm:p-8">
      <p className="text-sm font-semibold text-emerald-700">Novotech</p>
      <h1 className="mt-2 text-2xl font-semibold">{copy.title}</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-600">{copy.detail}</p>
      {state ? <dl className="mt-6 grid gap-3 border-y border-zinc-200 py-5 text-sm sm:grid-cols-2">
        <Detail label={locale === "ro" ? "Comandă" : "Заказ"} value={state.orderNumber} />
        <Detail label={locale === "ro" ? "Suma" : "Сумма"} value={formatRetailPrice(Number(state.amount), state.currency, locale)} />
        {state.confirmedAt ? <Detail label={locale === "ro" ? "Data plății" : "Дата оплаты"} value={new Intl.DateTimeFormat(locale === "ro" ? "ro-MD" : "ru-MD", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Chisinau" }).format(new Date(state.confirmedAt))} /> : null}
      </dl> : null}
      {state?.items.length ? <section className="mt-5"><h2 className="font-semibold">{locale === "ro" ? "Conținutul comenzii" : "Состав заказа"}</h2><ul className="mt-3 divide-y divide-zinc-100 border-y border-zinc-100">{state.items.map((item) => <li className="flex justify-between gap-4 py-3 text-sm" key={`${item.sku}:${item.name}`}><span><span className="block text-xs text-zinc-500">{item.sku}</span>{item.name}</span><strong className="shrink-0 tabular-nums">× {item.quantity}</strong></li>)}</ul></section> : null}
      <Link className="mt-6 inline-flex min-h-11 items-center justify-center border border-zinc-900 px-4 text-sm font-semibold" href={`/catalog?lang=${locale}`}>{locale === "ro" ? "Înapoi la catalog" : "Вернуться в каталог"}</Link>
    </section>
  </main></PublicRetailShell>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>; }

function paymentCopy(status: "PROCESSING" | "PAID" | "REFUND_PENDING" | "REFUNDED" | "FAILED" | "CANCELLED", locale: "ru" | "ro") {
  const ro = locale === "ro";
  if (status === "PAID") return { title: ro ? "Plata a fost confirmată" : "Оплата подтверждена", detail: ro ? "Comanda a fost confirmată pe baza stării verificate a plății." : "Заказ подтверждён на основании проверенного статуса платежа." };
  if (status === "REFUND_PENDING") return { title: ro ? "Rambursarea este procesată" : "Возврат обрабатывается", detail: ro ? "Starea finală va fi afișată după confirmarea MAIB." : "Итоговый статус появится после подтверждения MAIB." };
  if (status === "REFUNDED") return { title: ro ? "Rambursarea a fost efectuată" : "Возврат выполнен", detail: ro ? "Plata inițială rămâne în istoric, iar suma rambursabilă rămasă este zero." : "Первичная оплата сохранена в истории, остаток к возврату равен нулю." };
  if (status === "FAILED") return { title: ro ? "Plata nu a fost finalizată" : "Платёж не завершён", detail: ro ? "Comanda nu a fost activată. Puteți reveni la catalog." : "Заказ не был активирован. Вы можете вернуться в каталог." };
  if (status === "CANCELLED") return { title: ro ? "Plata a fost anulată" : "Платёж отменён", detail: ro ? "Comanda nu a fost activată." : "Заказ не был активирован." };
  return { title: ro ? "Plata este în curs de procesare" : "Платёж обрабатывается", detail: ro ? "Așteptăm confirmarea verificată de la MAIB. Revenirea în browser nu confirmă plata." : "Ожидаем проверенное подтверждение от MAIB. Возврат в браузер не подтверждает оплату." };
}

import type { Metadata } from "next";
import Link from "next/link";

import { getRetailPaymentReturnState } from "@/src/modules/payments/server";

export const metadata: Metadata = { title: "Payment status | Novotech", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Query = Promise<Record<string, string | string[] | undefined>>;

export default async function PaymentReturnPage({ searchParams }: { searchParams: Query }) {
  const query = await searchParams;
  const paymentAttemptId = typeof query.paymentAttemptId === "string" ? query.paymentAttemptId : "";
  const state = paymentAttemptId ? await getRetailPaymentReturnState(paymentAttemptId).catch(() => null) : null;
  const locale = state?.locale ?? "ru";
  const status = state?.status ?? "PROCESSING";
  const copy = paymentCopy(status, locale);
  return <main className="grid min-h-screen place-items-center bg-zinc-50 px-4">
    <section className="w-full max-w-lg border border-zinc-200 bg-white p-6 sm:p-8">
      <p className="text-sm font-semibold text-emerald-700">Novotech</p>
      <h1 className="mt-2 text-2xl font-semibold">{copy.title}</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-600">{copy.detail}</p>
      <Link className="mt-6 inline-flex min-h-11 items-center justify-center border border-zinc-900 px-4 text-sm font-semibold" href="/catalog">{locale === "ro" ? "Înapoi la catalog" : "Вернуться в каталог"}</Link>
    </section>
  </main>;
}

function paymentCopy(status: "PROCESSING" | "PAID" | "FAILED" | "CANCELLED", locale: "ru" | "ro") {
  const ro = locale === "ro";
  if (status === "PAID") return { title: ro ? "Plata a fost efectuată cu succes" : "Оплата прошла успешно", detail: ro ? "Comanda a fost confirmată pe baza stării verificate a plății." : "Заказ подтверждён на основании проверенного статуса платежа." };
  if (status === "FAILED") return { title: ro ? "Plata nu a fost finalizată" : "Платёж не завершён", detail: ro ? "Comanda nu a fost activată. Puteți reveni la catalog." : "Заказ не был активирован. Вы можете вернуться в каталог." };
  if (status === "CANCELLED") return { title: ro ? "Plata a fost anulată" : "Платёж отменён", detail: ro ? "Comanda nu a fost activată." : "Заказ не был активирован." };
  return { title: ro ? "Plata este în curs de procesare" : "Платёж обрабатывается", detail: ro ? "Așteptăm confirmarea verificată de la MAIB. Revenirea în browser nu confirmă plata." : "Ожидаем проверенное подтверждение от MAIB. Возврат в браузер не подтверждает оплату." };
}

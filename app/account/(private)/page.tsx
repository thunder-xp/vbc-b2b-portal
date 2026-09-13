import Link from "next/link";
import { ArrowRight, LockKeyhole, ReceiptText } from "lucide-react";

import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { finalCustomerCopy, getFinalCustomerLocale } from "@/src/modules/final-customer/locale";

export default async function FinalCustomerOverviewPage() {
  const [context, locale] = await Promise.all([getFinalCustomerContext(), getFinalCustomerLocale()]);
  const overview = await createFinalCustomerService().overview(context.account);
  const copy = finalCustomerCopy[locale];
  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8">
      <div>
        <p className="text-sm text-zinc-500">{copy.greeting}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{overview.displayName ?? copy.cabinet}</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center gap-2 text-zinc-700"><ReceiptText aria-hidden size={18} /><h2 className="font-semibold">{copy.recentOrder}</h2></div>
          {overview.latestOrder ? (
            <div className="mt-4">
              <p className="font-mono text-sm font-semibold">{overview.latestOrder.number}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{money(overview.latestOrder.total, overview.latestOrder.currency, locale)}</p>
              <Link className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-700" href="/account/orders">{copy.orders}<ArrowRight aria-hidden size={16} /></Link>
            </div>
          ) : <p className="mt-4 text-sm leading-6 text-zinc-500">{context.account.status === "ACTIVE" ? copy.noOrders : copy.review}</p>}
        </section>
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center gap-2 text-zinc-700"><LockKeyhole aria-hidden size={18} /><h2 className="font-semibold">{copy.security}</h2></div>
          <p className="mt-4 text-sm leading-6 text-zinc-600">{copy.accountReady}</p>
          <p className="mt-2 font-mono text-sm font-semibold">{context.verifiedPhone}</p>
          <Link className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-700" href="/account/security">{copy.security}<ArrowRight aria-hidden size={16} /></Link>
        </section>
      </div>
    </main>
  );
}

function money(value: number, currency: string, locale: "ru" | "ro") {
  return new Intl.NumberFormat(locale === "ro" ? "ro-MD" : "ru-MD", { style: "currency", currency }).format(value);
}

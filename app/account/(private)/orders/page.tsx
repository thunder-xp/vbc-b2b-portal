import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { finalCustomerCopy, getFinalCustomerLocale } from "@/src/modules/final-customer/locale";

export default async function FinalCustomerOrdersPage() {
  const [context, locale] = await Promise.all([getFinalCustomerContext(), getFinalCustomerLocale()]);
  const orders = await createFinalCustomerService().listOrders(context.account);
  const copy = finalCustomerCopy[locale];
  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{copy.orders}</h1>
      {orders.length ? (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {orders.map((order) => (
            <li className="grid gap-2 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-5" key={order.id}>
              <div><p className="font-mono text-sm font-semibold">{order.number}</p><p className="mt-1 text-xs text-zinc-500">{date(order.createdAt, locale)}</p></div>
              <span className="text-sm text-zinc-600">{order.status}</span>
              <strong className="tabular-nums">{money(order.total, order.currency, locale)}</strong>
            </li>
          ))}
        </ul>
      ) : <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm leading-6 text-zinc-500">{context.account.status === "ACTIVE" ? copy.noOrders : copy.review}</p>}
    </main>
  );
}

function date(value: string, locale: "ru" | "ro") { return new Intl.DateTimeFormat(locale === "ro" ? "ro-MD" : "ru-MD", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)); }
function money(value: number, currency: string, locale: "ru" | "ro") { return new Intl.NumberFormat(locale === "ro" ? "ro-MD" : "ru-MD", { style: "currency", currency }).format(value); }

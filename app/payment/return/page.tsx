import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Payment status | Novotech", robots: { index: false, follow: false } };

export default function PaymentReturnPage() {
  return <main className="grid min-h-screen place-items-center bg-zinc-50 px-4">
    <section className="w-full max-w-lg border border-zinc-200 bg-white p-6 sm:p-8">
      <p className="text-sm font-semibold text-emerald-700">Novotech</p>
      <h1 className="mt-2 text-2xl font-semibold">Проверяем статус платежа</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-600">Возврат с платёжной страницы не подтверждает оплату. Закройте эту страницу и проверьте защищённую страницу заказа позже.</p>
      <p className="mt-3 text-sm leading-6 text-zinc-600">Revenirea de pe pagina de plată nu confirmă plata. Închideți această pagină și verificați ulterior pagina securizată a comenzii.</p>
      <Link className="mt-6 inline-flex min-h-11 items-center justify-center border border-zinc-900 px-4 text-sm font-semibold" href="/catalog">Вернуться в каталог</Link>
    </section>
  </main>;
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicRetailCheckoutForm } from "@/src/modules/public-retail/components/PublicRetailCheckoutForm";
import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { getRetailCartTokenHash } from "@/src/modules/public-retail/retail-cart-cookie";
import { getRetailCheckoutService, hasRetailCheckoutAccess } from "@/src/modules/public-retail/retail-checkout-server";

export const metadata: Metadata = { title: "Checkout | Novotech", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PublicRetailCheckoutPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!await hasRetailCheckoutAccess()) notFound();
  const locale = publicRetailLocale((await searchParams).lang);
  const checkout = await getRetailCheckoutService().getCheckout(await getRetailCartTokenHash(), locale).catch(() => null);
  const ru = locale === "ru";
  return <PublicRetailShell cartQuantity={checkout?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0} languagePath="/checkout" locale={locale}><main className="min-h-[calc(100vh-4rem)] bg-zinc-50" lang={locale}><div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12"><header className="border-b border-zinc-200 pb-6"><Link className="text-sm font-semibold text-blue-700" href={`/cart?lang=${locale}`}>{ru ? "← Вернуться в корзину" : "← Înapoi în coș"}</Link><h1 className="mt-4 text-3xl font-semibold tracking-tight">{ru ? "Оформление заказа" : "Plasarea comenzii"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">{ru ? "Проверьте актуальные цены, укажите контактные данные и адрес." : "Verificați prețurile actuale și indicați datele de contact și adresa."}</p></header>{checkout?.eligible ? <PublicRetailCheckoutForm checkout={checkout} locale={locale} /> : <section className="mt-8 border border-amber-200 bg-amber-50 p-6"><h2 className="text-lg font-semibold text-amber-950">{ru ? "Заказ пока нельзя оформить" : "Comanda nu poate fi plasată momentan"}</h2><p className="mt-2 text-sm leading-6 text-amber-900">{blockingCopy(checkout?.blockingReason ?? null, locale)}</p><Link className="mt-5 inline-flex min-h-11 items-center bg-blue-700 px-4 text-sm font-semibold text-white" href={`/cart?lang=${locale}`}>{ru ? "Проверить корзину" : "Verifică coșul"}</Link></section>}</div></main></PublicRetailShell>;
}

function blockingCopy(reason: string | null, locale: "ru" | "ro") { const ru = locale === "ru"; if (reason === "unpublished_product") return ru ? "Одна или несколько позиций больше не опубликованы. Удалите их или выберите замену." : "Una sau mai multe poziții nu mai sunt publicate. Eliminați-le sau alegeți un înlocuitor."; if (reason === "unavailable_product") return ru ? "Одна или несколько позиций сейчас недоступны. Проверьте корзину." : "Una sau mai multe poziții nu sunt disponibile momentan. Verificați coșul."; if (reason === "currency_conflict") return ru ? "В корзине обнаружены несовместимые валюты." : "În coș au fost detectate monede incompatibile."; return ru ? "Корзина пуста или больше недоступна." : "Coșul este gol sau nu mai este disponibil."; }

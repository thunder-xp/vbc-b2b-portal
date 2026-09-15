import Image from "next/image";
import Link from "next/link";
import { PublicRetailAddToCartButton } from "@/src/modules/public-retail/components/PublicRetailAddToCartButton";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { buyAgainAllowed, customerDate, customerMoney } from "@/src/modules/final-customer/presentation";
import { CustomerPager } from "@/src/modules/final-customer/components";

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [context, locale] = await Promise.all([getFinalCustomerContext(), getFinalCustomerLocale()]);
  const page = positivePage((await searchParams).page); const pageSize = 20;
  const result = await createFinalCustomerService().purchases(context.account, pageSize + 1, (page - 1) * pageSize);
  const purchases = result.slice(0, pageSize); const hasNext = result.length > pageSize;
  const ro = locale === "ro";
  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8"><header><h1 className="text-2xl font-semibold">{ro ? "Cumpărături" : "Покупки"}</h1><p className="mt-1 text-sm text-zinc-600">{ro ? "Produse din comenzi plătite și confirmate." : "Товары из оплаченных и подтверждённых заказов."}</p></header>{purchases.length ? <ul className="grid gap-3">{purchases.map((line) => <li className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-[56px_1fr_auto] sm:items-center" key={line.id}><div className="relative size-14 overflow-hidden rounded-lg bg-zinc-100">{(line.currentProduct?.imageUrl ?? line.imageUrl) ? <Image alt="" fill className="object-contain p-1" sizes="56px" src={line.currentProduct?.imageUrl ?? line.imageUrl ?? ""} /> : null}</div><div><Link className="font-semibold hover:text-emerald-700" href={`/account/equipment/${line.id}`}>{line.name}</Link><p className="mt-1 text-xs text-zinc-500">SKU {line.sku} · {customerDate(line.purchasedAt, locale)} · {line.orderNumber}</p><p className="mt-1 text-sm">{line.quantity} × {customerMoney(line.unitPrice, line.currency, locale)}</p></div><div className="w-full sm:w-40">{line.currentProduct && buyAgainAllowed(line.currentProduct.availability) ? <PublicRetailAddToCartButton compact locale={locale} publicProductId={line.currentProduct.publicProductId} source="product_detail" /> : <p className="text-xs text-zinc-500">{ro ? "Indisponibil momentan" : "Сейчас недоступен"}</p>}</div></li>)}</ul> : <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500">{ro ? "Cumpărăturile confirmate vor apărea aici." : "Подтверждённые покупки появятся здесь."}</p>}<CustomerPager hasNext={hasNext} page={page} path="/account/purchases" ro={ro} /></main>;
}
function positivePage(value?: string) { const page = Number(value); return Number.isInteger(page) && page > 0 ? Math.min(page, 1000) : 1; }

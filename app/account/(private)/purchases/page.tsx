import Image from "next/image";
import Link from "next/link";
import { FileText, Headphones, PackageOpen } from "lucide-react";

import { PublicRetailAddToCartButton } from "@/src/modules/public-retail/components/PublicRetailAddToCartButton";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { buyAgainAllowed, customerDate, customerMoney } from "@/src/modules/final-customer/presentation";
import { CustomerEmptyState, CustomerPager } from "@/src/modules/final-customer/components";

const secondaryAction = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 px-3 text-sm font-semibold text-zinc-800 hover:border-emerald-400 hover:text-emerald-800";

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [context, locale, query] = await Promise.all([getFinalCustomerContext(), getFinalCustomerLocale(), searchParams]);
  const page = positivePage(query.page);
  const pageSize = 20;
  const result = await createFinalCustomerService().purchaseWorkspace(context.account, pageSize + 1, (page - 1) * pageSize);
  const purchases = result.slice(0, pageSize);
  const hasNext = result.length > pageSize;
  const ro = locale === "ro";

  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8">
    <header>
      <h1 className="text-2xl font-semibold">{ro ? "Cumpărături" : "Покупки"}</h1>
      <p className="mt-1 text-sm text-zinc-600">{ro ? "Produsele din comenzile dvs. achitate și confirmate." : "Товары из ваших оплаченных и подтверждённых заказов."}</p>
    </header>
    {purchases.length ? <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
      {purchases.map((line) => {
        const available = Boolean(line.currentProduct && buyAgainAllowed(line.currentProduct.availability));
        return <li className="grid gap-4 p-4 sm:grid-cols-[72px_minmax(0,1fr)] lg:grid-cols-[72px_minmax(0,1fr)_220px] lg:items-center" key={line.id}>
          <div className="relative size-[72px] overflow-hidden rounded-lg bg-zinc-100">
            {(line.currentProduct?.imageUrl ?? line.imageUrl) ? <Image alt="" fill className="object-contain p-1.5" sizes="72px" src={line.currentProduct?.imageUrl ?? line.imageUrl ?? ""} /> : <PackageOpen aria-hidden className="absolute inset-0 m-auto size-6 text-zinc-400" />}
          </div>
          <div className="min-w-0">
            <Link className="inline-flex min-h-11 items-center font-semibold hover:text-emerald-700" href={`/account/equipment/${line.id}`}>{line.name}</Link>
            <p className="text-xs text-zinc-500">SKU {line.sku}</p>
            <p className="mt-2 text-sm text-zinc-700">
              {ro ? "Cantitate" : "Количество"}: <strong>{line.quantity}</strong>
              <span aria-hidden> · </span>{customerDate(line.purchasedAt, locale)}
              <span aria-hidden> · </span><Link className="inline-flex min-h-11 items-center font-mono font-semibold text-emerald-700" href={`/account/orders/${line.orderId}`}>{line.orderNumber}</Link>
            </p>
            {line.currentProduct ? <p className="mt-1 text-xs text-zinc-500">{ro ? "Preț actual" : "Текущая цена"}: {customerMoney(line.currentProduct.price, line.currentProduct.currency, locale)}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {line.currentProduct ? <Link className={secondaryAction} href={`/products/${line.currentProduct.slug}?lang=${locale}`}>{ro ? "Deschide produsul" : "Открыть товар"}</Link> : null}
              <Link className={secondaryAction} href={`/account/service/new?orderId=${line.orderId}&orderLineId=${line.id}`}><Headphones aria-hidden className="size-4" />{ro ? "Service" : "Обратиться в сервис"}</Link>
              {(line.documentCount ?? 0) > 0 ? <Link className={secondaryAction} href={`/account/documents?orderId=${line.orderId}#purchase-${line.id}`}><FileText aria-hidden className="size-4" />{ro ? "Documente" : "Документы"}</Link> : null}
            </div>
          </div>
          <div className="sm:col-start-2 lg:col-start-auto lg:w-[220px]">
            {available && line.currentProduct ? <PublicRetailAddToCartButton compact locale={locale} publicProductId={line.currentProduct.publicProductId} source="product_detail" /> : <p className="rounded-lg bg-zinc-100 px-3 py-3 text-sm text-zinc-600">{ro ? "Indisponibil momentan" : "Сейчас недоступен"}</p>}
          </div>
        </li>;
      })}
    </ul> : <CustomerEmptyState
      body={ro ? "Produsele vor apărea aici după prima cumpărătură achitată și confirmată." : "Товары появятся здесь после первой оплаченной и подтверждённой покупки."}
      locale={locale}
      title={ro ? "Nu există încă cumpărături" : "Покупок пока нет"}
    />}
    <CustomerPager hasNext={hasNext} page={page} path="/account/purchases" ro={ro} />
  </main>;
}

function positivePage(value?: string) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? Math.min(page, 1000) : 1;
}

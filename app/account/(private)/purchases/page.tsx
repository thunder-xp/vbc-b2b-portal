import Image from "next/image";
import Link from "next/link";
import { Building2, FileText, Headphones, PackageOpen } from "lucide-react";

import { PublicRetailAddToCartButton } from "@/src/modules/public-retail/components/PublicRetailAddToCartButton";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { buyAgainAllowed, customerDate, customerMoney } from "@/src/modules/final-customer/presentation";
import { CustomerEmptyState, CustomerPager } from "@/src/modules/final-customer/components";
import { WorkspaceHeader, cabinetList, cabinetPage, cabinetSecondaryAction, cabinetSurface } from "@/src/modules/cabinet-experience/components";

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [context, locale, query] = await Promise.all([getFinalCustomerContext(), getFinalCustomerLocale(), searchParams]);
  const page = positivePage(query.page);
  const pageSize = 20;
  const service = createFinalCustomerService();
  const [result, objectWorkspace] = await Promise.all([
    service.purchaseWorkspace(context.account, pageSize + 1, (page - 1) * pageSize),
    service.customerObjectWorkspace(context.account, true),
  ]);
  const purchases = result.slice(0, pageSize);
  const hasNext = result.length > pageSize;
  const ro = locale === "ro";

  return <main className={cabinetPage}>
    <WorkspaceHeader actions={<Link className={cabinetSecondaryAction} href="/account/objects"><Building2 aria-hidden className="size-4" />{ro ? "Obiectele mele" : "Мои объекты"}</Link>} title={ro ? "Cumpărături" : "Покупки"} description={ro ? "Produsele din comenzile dvs. achitate și confirmate." : "Товары из ваших оплаченных и подтверждённых заказов."} />
    {objectWorkspace.unlinkedPurchaseCount > 0 ? <section className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${cabinetSurface}`}><div><strong>{ro ? `${objectWorkspace.unlinkedPurchaseCount} cumpărături nu sunt încă asociate unui obiect` : `${objectWorkspace.unlinkedPurchaseCount} покупок ещё не привязано к объекту`}</strong><p className="mt-1 text-sm text-zinc-600">{ro ? "Asociați-le pentru a păstra echipamentele, documentele și service-ul într-un singur loc." : "Привяжите их, чтобы оборудование, документы и сервис были собраны в одном месте."}</p></div><Link className={cabinetSecondaryAction} href={`/account/orders/${objectWorkspace.unlinkedPurchases[0]?.orderId ?? ""}`}>{ro ? "Asociază" : "Привязать"}</Link></section> : null}
    {purchases.length ? <ul className={cabinetList}>
      {purchases.map((line) => {
        const available = Boolean(line.currentProduct && buyAgainAllowed(line.currentProduct.availability));
        const objectLink = objectWorkspace.purchaseLinks.find((link) => link.orderId === line.orderId);
        return <li className="grid gap-4 p-4 sm:grid-cols-[72px_minmax(0,1fr)] lg:grid-cols-[72px_minmax(0,1fr)_220px] lg:items-center" key={line.id}>
          <div className="relative size-[72px] overflow-hidden rounded-lg bg-zinc-100">
            {(line.currentProduct?.imageUrl ?? line.imageUrl) ? <Image alt="" fill className="object-contain p-1.5" sizes="72px" src={line.currentProduct?.imageUrl ?? line.imageUrl ?? ""} /> : <PackageOpen aria-hidden className="absolute inset-0 m-auto size-6 text-zinc-400" />}
          </div>
          <div className="min-w-0">
            <Link className="inline-flex min-h-11 items-center font-semibold hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-700" href={`/account/equipment/${line.id}`}>{line.name}</Link>
            <p className="text-xs text-zinc-500">SKU {line.sku}</p>
            <p className="mt-2 text-sm text-zinc-700">
              {ro ? "Cantitate" : "Количество"}: <strong>{line.quantity}</strong>
              <span aria-hidden> · </span>{customerDate(line.purchasedAt, locale)}
              <span aria-hidden> · </span><Link className="inline-flex min-h-11 items-center font-mono font-semibold text-emerald-700" href={`/account/orders/${line.orderId}`}>{line.orderNumber}</Link>
            </p>
            {line.currentProduct ? <p className="mt-1 text-xs text-zinc-500">{ro ? "Preț actual" : "Текущая цена"}: {customerMoney(line.currentProduct.price, line.currentProduct.currency, locale)}</p> : null}
            <p className="mt-1 text-xs text-zinc-500">{ro ? "Obiect" : "Объект"}: {objectLink ? <Link className="font-medium text-emerald-700" href={`/account/objects/${objectLink.objectId}`}>{objectLink.objectName}{objectLink.objectStatus === "ARCHIVED" ? ` · ${ro ? "arhivat" : "архивный"}` : ""}</Link> : <Link className="font-medium text-amber-700" href={`/account/orders/${line.orderId}`}>{ro ? "Alegeți obiectul" : "Выбрать объект"}</Link>}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {line.currentProduct ? <Link className={cabinetSecondaryAction} href={`/products/${line.currentProduct.slug}?lang=${locale}`}>{ro ? "Deschide produsul" : "Открыть товар"}</Link> : null}
              <Link className={cabinetSecondaryAction} href={`/account/service/new?orderId=${line.orderId}&orderLineId=${line.id}`}><Headphones aria-hidden className="size-4" />{ro ? "Service" : "Обратиться в сервис"}</Link>
              {(line.documentCount ?? 0) > 0 ? <Link className={cabinetSecondaryAction} href={`/account/documents?orderId=${line.orderId}#purchase-${line.id}`}><FileText aria-hidden className="size-4" />{ro ? "Documente" : "Документы"}</Link> : null}
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

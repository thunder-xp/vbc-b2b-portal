import Link from "next/link";
import { FileText, PackageOpen } from "lucide-react";

import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { customerDate } from "@/src/modules/final-customer/presentation";
import { CustomerEmptyState } from "@/src/modules/final-customer/components";

export default async function CustomerDocumentsPage({ searchParams }: { searchParams: Promise<{ orderId?: string }> }) {
  const [context, locale, query] = await Promise.all([getFinalCustomerContext(), getFinalCustomerLocale(), searchParams]);
  const groups = await createFinalCustomerService().documentGroups(context.account, query.orderId);
  const ro = locale === "ro";

  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8">
    <header>
      <h1 className="text-2xl font-semibold">{ro ? "Documente" : "Документы"}</h1>
      <p className="mt-1 text-sm text-zinc-600">{ro ? "Documentele publicate sunt grupate după cumpărătură și produs." : "Опубликованные документы сгруппированы по покупке и товару."}</p>
    </header>
    {groups.length ? <div className="space-y-4">
      {groups.map((group) => <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white" key={group.orderId}>
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
          <div>
            <p className="text-xs text-zinc-500">{ro ? "Comandă" : "Заказ"} · {customerDate(group.purchasedAt, locale)}</p>
            <Link className="inline-flex min-h-11 items-center font-mono text-sm font-semibold text-emerald-700" href={`/account/orders/${group.orderId}`}>{group.orderNumber}</Link>
          </div>
          <PackageOpen aria-hidden className="size-5 text-zinc-400" />
        </header>
        <ul className="divide-y divide-zinc-100">
          {group.products.map((product) => <li className="p-4" id={`purchase-${product.lineId}`} key={product.lineId}>
            <Link className="inline-flex min-h-11 items-center font-semibold hover:text-emerald-700" href={`/account/equipment/${product.lineId}`}>{product.name}</Link>
            <p className="text-xs text-zinc-500">SKU {product.sku}</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {product.documents.map((document) => <li key={document.id}>
                <a className="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-emerald-700 hover:border-emerald-300" href={document.url} rel="noreferrer" target="_blank">
                  <FileText aria-hidden className="size-4 shrink-0" />
                  <span className="min-w-0"><span className="block truncate">{document.title}</span><span className="block text-xs font-normal text-zinc-500">{documentType(document.type, locale)}</span></span>
                </a>
              </li>)}
            </ul>
          </li>)}
        </ul>
      </section>)}
    </div> : <CustomerEmptyState
      body={ro ? "Documentele publicate pentru cumpărăturile dvs. vor apărea aici." : "Здесь появятся опубликованные документы по вашим покупкам."}
      locale={locale}
      primaryHref="/account/purchases"
      primaryLabel={ro ? "Cumpărături" : "Перейти к покупкам"}
      showService={false}
      title={ro ? "Nu există documente disponibile" : "Доступных документов пока нет"}
    />}
  </main>;
}

function documentType(type: string, locale: "ru" | "ro") {
  const labels: Record<string, [string, string]> = {
    datasheet: ["Техническое описание", "Fișă tehnică"],
    manual: ["Инструкция", "Manual"],
    certificate: ["Сертификат", "Certificat"],
    warranty: ["Общие условия гарантии", "Condiții generale de garanție"],
    marketing: ["Материал о товаре", "Material despre produs"],
    other: ["Документ", "Document"],
  };
  return labels[type]?.[locale === "ro" ? 1 : 0] ?? (locale === "ro" ? "Document" : "Документ");
}

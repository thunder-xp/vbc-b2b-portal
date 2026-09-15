import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";

export default async function CustomerDocumentsPage() {
  const [context, locale] = await Promise.all([getFinalCustomerContext(), getFinalCustomerLocale()]);
  const documents = await createFinalCustomerService().documents(context.account);
  const ro = locale === "ro";
  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8"><header><h1 className="text-2xl font-semibold">{ro ? "Documente" : "Документы"}</h1><p className="mt-1 text-sm text-zinc-600">{ro ? "Fișe tehnice, manuale, certificate și condiții publicate pentru produsele cumpărate." : "Инструкции, сертификаты и опубликованные условия по купленным товарам."}</p></header>{documents.length ? <ul className="grid gap-3 sm:grid-cols-2">{documents.map((document) => <li className="rounded-xl border border-zinc-200 bg-white p-4" key={document.id}><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{document.type}</p><p className="mt-1 font-semibold">{document.title}</p>{document.purchase ? <p className="mt-1 text-xs text-zinc-500">SKU {document.purchase.sku} · {document.purchase.name}</p> : null}<a className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700" href={document.url} rel="noreferrer" target="_blank">{ro ? "Deschide documentul" : "Открыть документ"}</a></li>)}</ul> : <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500">{ro ? "Nu există documente legitime pentru cumpărăturile curente." : "Для текущих покупок нет доступных подтверждённых документов."}</p>}</main>;
}

import { Download } from "lucide-react";
import Link from "next/link";

import { documentsCopy, formatPartnerDate, type PartnerLocale } from "../../partner-locale";
import { documentTypeLabel, isCurrentDocumentState, localizedDocumentStateLabel } from "../document-taxonomy";
import type { PartnerDocumentDetail as Model } from "../types";
import { languageLabel } from "./DocumentCard";

export function DocumentDetail({ document, locale = "ru" }: { document: Model; locale?: PartnerLocale }) {
  const copy = documentsCopy(locale);
  const current = isCurrentDocumentState(document);
  return <article className="space-y-7">
    <header className="border-b border-zinc-200 pb-6"><p className="text-xs font-semibold uppercase text-emerald-700">{documentTypeLabel(locale, document.documentType)}</p><h1 className="mt-2 text-2xl font-semibold text-zinc-950 sm:text-3xl">{document.title}</h1>{document.description && <p className="mt-3 max-w-3xl text-sm text-zinc-600">{document.description}</p>}<p className={`mt-3 text-sm font-medium ${current ? "text-emerald-700" : "text-amber-800"}`}>{localizedDocumentStateLabel(locale, document)}</p></header>
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label={copy.number} value={document.documentNumber ?? copy.notSpecified}/><Metric label={copy.issueDate} value={document.issueDate ? formatPartnerDate(`${document.issueDate}T00:00:00`, locale) : copy.notSpecifiedFeminine}/><Metric label={copy.version} value={document.version}/><Metric label={copy.language} value={languageLabel(document.languageCode, locale)}/>{document.validUntil && <Metric label={copy.validUntil} value={formatPartnerDate(`${document.validUntil}T00:00:00`, locale)}/>}</dl>
    {document.products.length > 0 && <section><h2 className="text-lg font-semibold">{copy.relatedProducts}</h2><ul className="mt-3 divide-y divide-zinc-200 border-y border-zinc-200">{document.products.map((product) => <li className="py-3" key={product.id}><Link className="font-medium text-emerald-700" href={`/cabinet/catalog/${product.slug}`}>{product.sku} · {product.name}</Link></li>)}</ul></section>}
    {document.orders.length > 0 && <section><h2 className="text-lg font-semibold">{copy.relatedOrders}</h2><ul className="mt-3 divide-y divide-zinc-200 border-y border-zinc-200">{document.orders.map((order) => <li className="py-3" key={order.id}><Link className="font-medium text-emerald-700" href={`/cabinet/orders/${order.id}`}>{copy.order} {order.number}</Link></li>)}</ul></section>}
    <div className="flex flex-wrap gap-3"><Link className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 px-4 text-sm font-semibold" href="/cabinet/documents">{copy.allDocuments}</Link>{document.status === "available" && document.fileName ? <a className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" href={`/api/documents/${document.id}/download`}><Download className="size-4"/>{copy.downloadDocument}</a> : <p className="self-center text-sm text-zinc-600">{copy.fileUnavailable}</p>}</div>
  </article>;
}
function Metric({label,value}:{label:string;value:string}){return <div><dt className="text-xs uppercase text-zinc-500">{label}</dt><dd className="mt-1 font-medium text-zinc-950">{value}</dd></div>}

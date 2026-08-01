import { Download } from "lucide-react";
import Link from "next/link";

import { DOCUMENT_TYPE_LABELS, documentStateLabel } from "../document-taxonomy";
import type { PartnerDocumentDetail as Model } from "../types";
import { formatDate, languageLabel } from "./DocumentCard";

export function DocumentDetail({ document }: { document: Model }) {
  return <article className="space-y-7">
    <header className="border-b border-zinc-200 pb-6"><p className="text-xs font-semibold uppercase text-emerald-700">{DOCUMENT_TYPE_LABELS[document.documentType]}</p><h1 className="mt-2 text-2xl font-semibold text-zinc-950 sm:text-3xl">{document.title}</h1>{document.description?<p className="mt-3 max-w-3xl text-sm text-zinc-600">{document.description}</p>:null}<p className={`mt-3 text-sm font-medium ${["Актуальная версия","Проведён"].includes(documentStateLabel(document))?"text-emerald-700":"text-amber-800"}`}>{documentStateLabel(document)}</p></header>
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Номер" value={document.documentNumber??"Не указан"}/><Metric label="Дата выпуска" value={document.issueDate?formatDate(document.issueDate):"Не указана"}/><Metric label="Версия" value={document.version}/><Metric label="Язык" value={languageLabel(document.languageCode)}/>{document.validUntil?<Metric label="Действителен до" value={formatDate(document.validUntil)}/>:null}</dl>
    {document.products.length?<section><h2 className="text-lg font-semibold">Связанные товары</h2><ul className="mt-3 divide-y divide-zinc-200 border-y border-zinc-200">{document.products.map((product)=><li className="py-3" key={product.id}><Link className="font-medium text-emerald-700" href={`/cabinet/catalog/${product.slug}`}>{product.sku} · {product.name}</Link></li>)}</ul></section>:null}
    {document.orders.length?<section><h2 className="text-lg font-semibold">Связанные заказы</h2><ul className="mt-3 divide-y divide-zinc-200 border-y border-zinc-200">{document.orders.map((order)=><li className="py-3" key={order.id}><Link className="font-medium text-emerald-700" href={`/cabinet/orders/${order.id}`}>Заказ № {order.number}</Link></li>)}</ul></section>:null}
    <div className="flex flex-wrap gap-3"><Link className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 px-4 text-sm font-semibold" href="/cabinet/documents">Все документы</Link>{document.status==="available"&&document.fileName?<a className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" href={`/api/documents/${document.id}/download`}><Download className="size-4"/>Скачать документ</a>:<p className="self-center text-sm text-zinc-600">Файл пока недоступен</p>}</div>
  </article>;
}
function Metric({label,value}:{label:string;value:string}){return <div><dt className="text-xs uppercase text-zinc-500">{label}</dt><dd className="mt-1 font-medium text-zinc-950">{value}</dd></div>}

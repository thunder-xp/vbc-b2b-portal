import { Download, ExternalLink, FileText } from "lucide-react";
import Link from "next/link";

import { DOCUMENT_TYPE_LABELS, documentStateLabel } from "../document-taxonomy";
import type { PartnerDocumentListItem } from "../types";

export function DocumentCard({ document, compact = false }: { document: PartnerDocumentListItem; compact?: boolean }) {
  const state = documentStateLabel(document);
  return <article className="grid min-w-0 gap-4 border-b border-zinc-200 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
    <div className="min-w-0">
      <div className="flex items-start gap-3"><FileText aria-hidden className="mt-0.5 size-5 shrink-0 text-emerald-700" /><div className="min-w-0"><p className="text-xs font-semibold uppercase text-zinc-500">{DOCUMENT_TYPE_LABELS[document.documentType]}</p><h2 className="mt-1 break-words font-semibold text-zinc-950">{document.title}</h2></div></div>
      {!compact ? <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
        {document.documentNumber ? <span>№ {document.documentNumber}</span> : null}
        {document.issueDate ? <time dateTime={document.issueDate}>от {formatDate(document.issueDate)}</time> : null}
        <span>Версия {document.version}</span><span>{languageLabel(document.languageCode)}</span>
        {document.fileName ? <span>{fileDescription(document)}</span> : null}
      </div> : null}
      <p className={`mt-2 text-sm ${state === "Актуальная версия" || state === "Проведён" ? "text-emerald-700" : "text-amber-800"}`}>{state}</p>
      {!compact && document.products.length ? <p className="mt-1 truncate text-xs text-zinc-500">Товары: {document.products.map((product) => `${product.sku} ${product.name}`).join(", ")}</p> : null}
      {!compact && document.orders.length ? <p className="mt-1 text-xs text-zinc-500">Заказы: {document.orders.map((order) => order.number).join(", ")}</p> : null}
    </div>
    <div className="flex flex-wrap gap-2 sm:justify-end">
      <Link className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600" href={`/cabinet/documents/${document.id}`}><ExternalLink aria-hidden className="size-4" />Подробнее</Link>
      {document.status === "available" && document.fileName ? <a aria-label={`Скачать: ${document.title}`} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600" href={`/api/documents/${document.id}/download`}><Download aria-hidden className="size-4" />Скачать</a> : null}
    </div>
  </article>;
}

export function formatDate(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU"); }
export function languageLabel(value: PartnerDocumentListItem["languageCode"]) { return ({ ru: "Русский", ro: "Română", en: "English", multi: "Несколько языков" } as const)[value]; }
function fileDescription(document: PartnerDocumentListItem) { const format=document.mimeType === "application/pdf" ? "PDF" : document.fileName?.split(".").pop()?.toUpperCase() ?? "Файл"; return document.fileSize === null ? format : `${format}, ${formatBytes(document.fileSize)}`; }
function formatBytes(value:number){if(value<1024)return `${value} Б`;if(value<1024*1024)return `${Math.ceil(value/1024)} КБ`;return `${(value/1024/1024).toFixed(1)} МБ`;}

import { Download, ExternalLink, FileText } from "lucide-react";
import Link from "next/link";

import { documentsCopy, formatPartnerDate, type PartnerLocale } from "../../partner-locale";
import { documentTypeLabel, isCurrentDocumentState, localizedDocumentStateLabel } from "../document-taxonomy";
import type { PartnerDocumentListItem } from "../types";

export function DocumentCard({ document, compact = false, locale = "ru" }: { document: PartnerDocumentListItem; compact?: boolean; locale?: PartnerLocale }) {
  const copy = documentsCopy(locale);
  const state = localizedDocumentStateLabel(locale, document);
  const current = isCurrentDocumentState(document);
  return <article className="grid min-w-0 gap-4 border-b border-zinc-200 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
    <div className="min-w-0">
      <div className="flex items-start gap-3"><FileText aria-hidden className="mt-0.5 size-5 shrink-0 text-emerald-700" /><div className="min-w-0"><p className="text-xs font-semibold uppercase text-zinc-500">{documentTypeLabel(locale, document.documentType)}</p><h2 className="mt-1 break-words font-semibold text-zinc-950">{document.title}</h2></div></div>
      {!compact && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">{document.documentNumber && <span>№ {document.documentNumber}</span>}{document.issueDate && <time dateTime={document.issueDate}>{copy.fromDate} {formatPartnerDate(`${document.issueDate}T00:00:00`, locale)}</time>}<span>{copy.version} {document.version}</span><span>{languageLabel(document.languageCode, locale)}</span>{document.fileName && <span>{fileDescription(document, locale)}</span>}</div>}
      <p className={`mt-2 text-sm ${current ? "text-emerald-700" : "text-amber-800"}`}>{state}</p>
      {!compact && document.products.length > 0 && <p className="mt-1 truncate text-xs text-zinc-500">{copy.products}: {document.products.map((product) => `${product.sku} ${product.name}`).join(", ")}</p>}
      {!compact && document.orders.length > 0 && <p className="mt-1 text-xs text-zinc-500">{copy.orders}: {document.orders.map((order) => order.number).join(", ")}</p>}
    </div>
    <div className="flex flex-wrap gap-2 sm:justify-end">
      <Link className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600" href={`/cabinet/documents/${document.id}`}><ExternalLink aria-hidden className="size-4" />{copy.details}</Link>
      {document.status === "available" && document.fileName && <a aria-label={`${copy.download}: ${document.title}`} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600" href={`/api/documents/${document.id}/download`}><Download aria-hidden className="size-4" />{copy.download}</a>}
    </div>
  </article>;
}

export function languageLabel(value: PartnerDocumentListItem["languageCode"], locale: PartnerLocale) { const copy=documentsCopy(locale); return ({ ru: copy.russian, ro: copy.romanian, en: "English", multi: copy.multiple } as const)[value]; }
function fileDescription(document: PartnerDocumentListItem, locale: PartnerLocale) { const copy=documentsCopy(locale); const format=document.mimeType === "application/pdf" ? "PDF" : document.fileName?.split(".").pop()?.toUpperCase() ?? copy.file; return document.fileSize === null ? format : `${format}, ${formatBytes(document.fileSize, locale)}`; }
function formatBytes(value:number, locale: PartnerLocale){const copy=documentsCopy(locale);if(value<1024)return `${value} ${copy.bytes}`;if(value<1024*1024)return `${Math.ceil(value/1024)} ${copy.kilobytes}`;return `${(value/1024/1024).toFixed(1)} ${copy.megabytes}`;}

import Link from "next/link";

import { NumberedPagination } from "../../platform-ui";

import { DOCUMENT_SECTIONS, DOCUMENT_TYPE_LABELS } from "../document-taxonomy";
import type { DocumentSection, DocumentStateFilter, PartnerDocumentPage, PartnerDocumentType } from "../types";
import { DocumentCard } from "./DocumentCard";

export function DocumentCenter({ page, filters }: { page: PartnerDocumentPage; filters: { q?: string; section?: DocumentSection; type?: PartnerDocumentType; language?: string; state?: DocumentStateFilter } }) {
  return <div className="space-y-6">
    <nav aria-label="Разделы документов" className="flex gap-2 overflow-x-auto pb-1">{DOCUMENT_SECTIONS.map((section) => <Link className={`shrink-0 rounded-md border px-3 py-2 text-sm font-medium ${filters.section === section.value || (!filters.section && section.value === "all") ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-zinc-200 text-zinc-700"}`} href={href({ ...filters, section: section.value, page: undefined })} key={section.value}>{section.label}</Link>)}</nav>
    <form className="grid gap-3 border-y border-zinc-200 py-4 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1fr)_13rem_10rem_11rem_auto] lg:items-end">
      <Field label="Поиск"><input defaultValue={filters.q} name="q" placeholder="Номер, заказ, SKU или название" type="search" /></Field>
      <Field label="Тип"><select defaultValue={filters.type ?? ""} name="type"><option value="">Все типы</option>{Object.entries(DOCUMENT_TYPE_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="Язык"><select defaultValue={filters.language ?? ""} name="language"><option value="">Все языки</option><option value="ru">Русский</option><option value="ro">Română</option><option value="en">English</option><option value="multi">Несколько</option></select></Field>
      <Field label="Состояние"><select defaultValue={filters.state ?? "current"} name="state"><option value="current">Текущие</option><option value="expired">Истёкшие</option><option value="superseded">Предыдущие версии</option><option value="all">Все</option></select></Field>
      <input name="section" type="hidden" value={filters.section ?? "all"} /><button className="min-h-11 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white" type="submit">Найти</button>
    </form>
    <p aria-live="polite" className="text-sm text-zinc-600">Найдено документов: {page.totalCount}</p>
    {page.items.length ? <div>{page.items.map((document)=><DocumentCard document={document} key={document.id} />)}</div> : <section className="border-y border-zinc-200 py-10 text-center"><h2 className="font-semibold text-zinc-950">Документы не найдены</h2><p className="mt-2 text-sm text-zinc-600">Измените период или фильтры. Новые документы появятся после публикации.</p></section>}
    <NumberedPagination ariaLabel="Страницы документов" currentPage={page.page} hrefForPage={(targetPage) => href({ ...filters, page: targetPage })} totalPages={page.totalPages} />
  </div>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="grid gap-1 text-sm font-medium text-zinc-800">{label}<span className="[&_input]:h-11 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-zinc-300 [&_input]:px-3 [&_select]:h-11 [&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:border-zinc-300 [&_select]:px-3">{children}</span></label>}
function href(values:Record<string,string|number|undefined>){const params=new URLSearchParams();Object.entries(values).forEach(([key,value])=>{if(value!==undefined&&value!==""&&!(key==="section"&&value==="all"))params.set(key,String(value));});const query=params.toString();return query?`/cabinet/documents?${query}`:"/cabinet/documents";}

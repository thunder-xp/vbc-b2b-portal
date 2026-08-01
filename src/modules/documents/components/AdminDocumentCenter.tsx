"use client";

import { useActionState } from "react";

import { archiveProductDocumentAction, uploadProductDocumentAction } from "../actions/document.actions";
import { DOCUMENT_TYPE_LABELS } from "../document-taxonomy";
import type { AdminDocumentPage, DocumentBuilderProduct, DocumentHealth } from "../types";

const PRODUCT_TYPES = ["datasheet","user_manual","installation_manual","certificate","declaration_of_conformity","test_report","technical_drawing","firmware_release_note","warranty_terms","price_list","brochure","presentation","marketing_material"] as const;

export function AdminDocumentCenter({ canManage, page, products }: { canManage: boolean; page: AdminDocumentPage; products: DocumentBuilderProduct[] }) {
  const [state, action, pending] = useActionState(uploadProductDocumentAction, null);
  return <div className="space-y-8">
    {canManage ? <section className="border-b border-zinc-200 pb-7"><h2 className="text-xl font-semibold">Опубликовать документ товара</h2><p className="mt-1 text-sm text-zinc-600">PDF хранится в закрытом хранилище. Предыдущая версия остаётся в истории.</p>
      <form action={action} className="mt-5 grid gap-4 lg:grid-cols-2">
        <Field label="Название"><input maxLength={240} name="title" required/></Field><Field label="Тип"><select name="documentType" required>{PRODUCT_TYPES.map((type)=><option key={type} value={type}>{DOCUMENT_TYPE_LABELS[type]}</option>)}</select></Field>
        <Field label="Язык"><select name="languageCode"><option value="ru">Русский</option><option value="ro">Română</option><option value="en">English</option><option value="multi">Несколько языков</option></select></Field><Field label="Версия"><input defaultValue="1" maxLength={50} name="version" required/></Field>
        <Field label="Дата выпуска"><input name="issueDate" type="date"/></Field><Field label="Действителен до"><input name="validUntil" type="date"/></Field>
        <Field label="PDF-файл"><input accept="application/pdf,.pdf" name="file" required type="file"/></Field>
        <label className="grid gap-1 text-sm font-medium">Товары<select className="min-h-36 rounded-md border border-zinc-300 p-2" multiple name="productIds" required>{products.map((product)=><option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select><span className="text-xs font-normal text-zinc-500">Ctrl/Cmd для выбора нескольких товаров.</span></label>
        <label className="grid gap-1 text-sm font-medium lg:col-span-2">Описание<textarea className="rounded-md border border-zinc-300 px-3 py-2" maxLength={1000} name="description" rows={3}/></label>
        <div className="lg:col-span-2"><button className="min-h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-zinc-300" disabled={pending}>{pending?"Публикуем...":"Опубликовать"}</button>{state?<p aria-live="polite" className={`mt-2 text-sm ${state.success?"text-emerald-700":"text-rose-700"}`}>{state.message}</p>:null}</div>
      </form>
    </section> : null}
    <section><h2 className="text-xl font-semibold">Метаданные документов</h2><p className="mt-1 text-sm text-zinc-600">Всего: {page.totalCount}</p><div className="mt-3 divide-y divide-zinc-200 border-y border-zinc-200">{page.items.map((document)=><article className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center" key={document.id}><div><p className="text-xs font-semibold uppercase text-zinc-500">{DOCUMENT_TYPE_LABELS[document.documentType]} · {document.sourceSystem}</p><h3 className="mt-1 font-semibold">{document.title}</h3><p className="mt-1 text-xs text-zinc-500">Версия {document.version} · {document.companyName??"Документ товара"} · {document.isCurrent?"текущая":"предыдущая"}</p></div>{document.sourceSystem==="portal"&&document.status!=="archived"?<button className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm font-semibold" onClick={()=>void archiveProductDocumentAction(document.id)}>Архивировать</button>:null}</article>)}</div></section>
</div>;
}

export function DocumentHealthView({ health }: { health: DocumentHealth }) { const entries=[['Метаданные',health.totalMetadata],['Доступные файлы',health.availableFiles],['Недоступные файлы',health.missingFiles],['Истёкшие',health.expired],['Предыдущие версии',health.superseded],['Без связи с заказом',health.unlinkedOrderDocuments],['Без связи с товаром',health.unlinkedProductDocuments],['Ошибки скачивания за 30 дней',health.downloadFailures]] as const; return <div className="space-y-6"><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{entries.map(([label,value])=><div className="border border-zinc-200 bg-white p-4" key={label}><p className="text-xs uppercase text-zinc-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}</section><section className="border-y border-zinc-200 py-5"><h2 className="font-semibold">Синхронизация 1С</h2><p className="mt-2 text-sm text-zinc-700">Статус: {health.syncState?.status??"не настроено"}</p><p className="mt-1 text-sm text-amber-800">Провайдер: {health.syncState?.provider_status??"not_implemented"}. Метаданные бухгалтерских документов не заявлены доступными.</p></section></div> }

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="grid gap-1 text-sm font-medium">{label}<span className="[&_input]:h-11 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-zinc-300 [&_input]:px-3 [&_select]:h-11 [&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:border-zinc-300 [&_select]:px-3">{children}</span></label>}
